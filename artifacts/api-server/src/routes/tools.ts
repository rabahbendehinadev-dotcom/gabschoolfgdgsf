import crypto from "crypto";
import { Router, type IRouter } from "express";
import { db, toolsTable, toolCategoriesTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { optionalUserAuth } from "../middlewares/auth";
import { isActiveVip } from "../lib/vipUtils";
import { comparePassword } from "../lib/auth";
import { DownloadToolBody } from "@workspace/api-zod";

const router: IRouter = Router();

function signDownloadToken(toolId: number): string {
  const expiry = Date.now() + 120_000;
  const data = `${toolId}.${expiry}`;
  const secret = process.env.JWT_SECRET ?? "tools-secret-fallback";
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return Buffer.from(`${data}.${sig}`).toString("base64url");
}

function verifyDownloadToken(token: string): number | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const parts = decoded.split(".");
    if (parts.length < 3) return null;
    const sig = parts[parts.length - 1];
    const data = parts.slice(0, -1).join(".");
    const [toolIdStr, expiryStr] = data.split(".");
    const expiry = parseInt(expiryStr, 10);
    if (isNaN(expiry) || Date.now() > expiry) return null;
    const secret = process.env.JWT_SECRET ?? "tools-secret-fallback";
    const expectedSig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
    if (sig !== expectedSig) return null;
    const id = parseInt(toolIdStr, 10);
    return isNaN(id) ? null : id;
  } catch {
    return null;
  }
}

/* ── Public: list visible tool categories ───────────────────────────── */
router.get("/tool-categories", async (_req, res) => {
  try {
    const cats = await db
      .select({ id: toolCategoriesTable.id, name: toolCategoriesTable.name, sortOrder: toolCategoriesTable.sortOrder })
      .from(toolCategoriesTable)
      .where(eq(toolCategoriesTable.isVisible, true))
      .orderBy(asc(toolCategoriesTable.sortOrder), asc(toolCategoriesTable.id));
    res.json(cats);
  } catch (err) {
    console.error("[tools] GET /tool-categories error:", err);
    res.status(500).json({ message: "حدث خطأ في جلب التصنيفات" });
  }
});

/* ── Public: list published tools ───────────────────────────────────── */
router.get("/tools", optionalUserAuth, async (_req, res) => {
  try {
    const tools = await db
      .select({
        id:           toolsTable.id,
        name:         toolsTable.name,
        description:  toolsTable.description,
        imageUrl:     toolsTable.imageUrl,
        categoryId:   toolsTable.categoryId,
        categoryName: toolCategoriesTable.name,
        accessType:   toolsTable.accessType,
        os:           toolsTable.os,
        sortOrder:    toolsTable.sortOrder,
      })
      .from(toolsTable)
      .leftJoin(toolCategoriesTable, eq(toolsTable.categoryId, toolCategoriesTable.id))
      .where(eq(toolsTable.isPublished, true))
      .orderBy(asc(toolsTable.sortOrder), asc(toolsTable.id));

    res.json(tools);
  } catch (err) {
    console.error("[tools] GET /tools error:", err);
    res.status(500).json({ message: "حدث خطأ في جلب الأدوات" });
  }
});

/* ── Download: validate access + issue signed token ─────────────────── */
router.post("/tools/:id/download", optionalUserAuth, async (req, res) => {
  try {
    const toolId = parseInt(req.params.id, 10);
    if (isNaN(toolId)) {
      res.status(400).json({ message: "معرّف الأداة غير صالح" });
      return;
    }

    const [tool] = await db
      .select()
      .from(toolsTable)
      .where(and(eq(toolsTable.id, toolId), eq(toolsTable.isPublished, true)))
      .limit(1);

    if (!tool) {
      res.status(404).json({ message: "الأداة غير موجودة" });
      return;
    }

    if (!tool.downloadUrl) {
      res.status(500).json({ message: "رابط التحميل غير مضبوط، تواصل مع الإدارة" });
      return;
    }

    const accessType = tool.accessType as "free" | "password" | "vip" | "vip_password";
    const user = req.user ?? null;

    if (accessType === "vip" || accessType === "vip_password") {
      if (!user) {
        res.status(401).json({ message: "يجب تسجيل الدخول للوصول إلى هذه الأداة", requiresAuth: true });
        return;
      }
      if (!isActiveVip(user)) {
        res.status(403).json({ message: "هذه الأداة حصرية لأعضاء VIP", requiresVip: true });
        return;
      }
    }

    if (accessType === "password" || accessType === "vip_password") {
      const parsed = DownloadToolBody.safeParse(req.body);
      const password = parsed.success ? (parsed.data.password ?? "") : "";
      if (!password) {
        res.status(400).json({ message: "كلمة المرور مطلوبة", requiresPassword: true });
        return;
      }
      if (!tool.passwordHash) {
        res.status(500).json({ message: "كلمة المرور غير مضبوطة، تواصل مع الإدارة" });
        return;
      }
      const valid = await comparePassword(password, tool.passwordHash);
      if (!valid) {
        res.status(403).json({ message: "كلمة المرور غير صحيحة", requiresPassword: true });
        return;
      }
    }

    const token = signDownloadToken(toolId);
    const signedUrl = `/api/tools/dl/${token}`;
    res.json({ signedUrl });
  } catch (err) {
    console.error("[tools] POST /tools/:id/download error:", err);
    res.status(500).json({ message: "حدث خطأ أثناء معالجة طلب التحميل" });
  }
});

/* ── Download redirect via signed token ──────────────────────────────── */
router.get("/tools/dl/:token", async (req, res) => {
  const toolId = verifyDownloadToken(req.params.token);
  if (!toolId) {
    res.status(400).send("رابط التحميل منتهي الصلاحية أو غير صالح. يرجى المحاولة مجدداً.");
    return;
  }
  try {
    const [tool] = await db
      .select({ downloadUrl: toolsTable.downloadUrl })
      .from(toolsTable)
      .where(and(eq(toolsTable.id, toolId), eq(toolsTable.isPublished, true)))
      .limit(1);

    if (!tool?.downloadUrl) {
      res.status(404).send("الأداة غير موجودة أو رابط التحميل مفقود.");
      return;
    }

    res.redirect(302, tool.downloadUrl);
  } catch (err) {
    console.error("[tools] GET /tools/dl/:token error:", err);
    res.status(500).send("حدث خطأ أثناء التحميل.");
  }
});

export default router;
