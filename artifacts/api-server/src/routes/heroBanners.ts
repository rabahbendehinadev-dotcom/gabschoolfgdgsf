import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import { db, heroBannersTable as heroBanners } from "@workspace/db";
import { adminAuth } from "../middlewares/auth";
import { hasAdminPermission } from "../lib/adminSecurity";
import { readBannerImage, saveBannerImage } from "../lib/bannerStorage";
import { disposeBannerPath, drainBannerCleanupQueue, enqueueBannerCleanup } from "../lib/bannerCleanup";

const router: IRouter = Router();
const idSchema = z.coerce.number().int().positive();
const titleSchema = z.string().trim().min(1).max(160);
const variantSchema = z.enum(["desktop", "mobile"]);
const jsonBody = z.object({ title: titleSchema, isActive: z.boolean().optional() }).strict();
const patchBody = z.object({ title: titleSchema.optional(), isActive: z.boolean().optional() }).strict().refine(v => Object.keys(v).length > 0, "At least one field is required");
const reorderBody = z.object({ ids: z.array(z.number().int().positive()).max(500) }).strict();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
function parseUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("image")(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ message: "Image must be 8 MiB or smaller" });
      return;
    }
    res.status(400).json({ message: error instanceof Error ? error.message : "Invalid upload" });
  });
}

function adminGuard(req: Request, res: Response, next: NextFunction) {
  if (!req.admin || !hasAdminPermission(req.admin, "manage_content")) {
    res.status(403).json({ message: "Content management permission required" });
    return;
  }
  next();
}

function badInput(res: Response, error: unknown) {
  res.status(400).json({ message: error instanceof z.ZodError ? error.issues[0]?.message || "Invalid input" : "Invalid input" });
}

function publicProjection(row: typeof heroBanners.$inferSelect) {
  const version = row.updatedAt.getTime();
  return {
    id: row.id,
    desktopImageUrl: `/api/hero-banners/${row.id}/images/desktop?v=${version}`,
    mobileImageUrl: row.mobileImagePath ? `/api/hero-banners/${row.id}/images/mobile?v=${version}` : null,
  };
}

function adminProjection(row: typeof heroBanners.$inferSelect) {
  const version = row.updatedAt.getTime();
  return {
    id: row.id,
    title: row.title,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    desktopImageUrl: row.desktopImagePath ? `/api/admin/hero-banners/${row.id}/images/desktop?v=${version}` : null,
    mobileImageUrl: row.mobileImagePath ? `/api/admin/hero-banners/${row.id}/images/mobile?v=${version}` : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function serveImage(req: Request, res: Response, admin: boolean) {
  const id = idSchema.parse(req.params.id);
  const variant = variantSchema.parse(req.params.variant);
  const [row] = await db.select().from(heroBanners).where(eq(heroBanners.id, id)).limit(1);
  if (!row || (!admin && !row.isActive)) return res.status(404).json({ message: "Banner image not found" });
  const path = variant === "desktop" ? row.desktopImagePath : row.mobileImagePath;
  if (!path) return res.status(404).json({ message: "Banner image not found" });
  const image = await readBannerImage(path);
  res.setHeader("Content-Type", image.contentType);
  res.setHeader("Cache-Control", admin ? "private, no-store" : "public, max-age=300");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.send(image.data);
}

router.get("/hero-banners", async (_req, res) => {
  const rows = await db.select().from(heroBanners)
    .where(and(eq(heroBanners.isActive, true), sql`${heroBanners.desktopImagePath} IS NOT NULL`))
    .orderBy(asc(heroBanners.sortOrder), asc(heroBanners.id));
  res.json(rows.map(publicProjection));
});

router.get("/hero-banners/:id/images/:variant", async (req, res) => {
  try { await serveImage(req, res, false); } catch (error) { if (error instanceof z.ZodError) return badInput(res, error); res.status(404).json({ message: "Banner image not found" }); }
});

router.use("/admin/hero-banners", adminAuth, adminGuard);

router.get("/admin/hero-banners", async (_req, res) => {
  const rows = await db.select().from(heroBanners).orderBy(asc(heroBanners.sortOrder), asc(heroBanners.id));
  res.json(rows.map(adminProjection));
});

router.post("/admin/hero-banners", async (req, res) => {
  try {
    const input = jsonBody.parse(req.body);
    const [row] = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('hero-banners-order'))`);
      const [{ maxOrder }] = await tx.select({ maxOrder: sql<number>`coalesce(max(${heroBanners.sortOrder}), -1)` }).from(heroBanners);
      return tx.insert(heroBanners).values({ ...input, sortOrder: Number(maxOrder) + 1 }).returning();
    });
    res.status(201).json(adminProjection(row));
  } catch (error) { return badInput(res, error); }
});

router.patch("/admin/hero-banners/:id", async (req, res) => {
  try {
    const id = idSchema.parse(req.params.id);
    const input = patchBody.parse(req.body);
    const [row] = await db.update(heroBanners).set({ ...input, updatedAt: new Date() }).where(eq(heroBanners.id, id)).returning();
    if (!row) return res.status(404).json({ message: "Banner not found" });
    return res.json(adminProjection(row));
  } catch (error) { return badInput(res, error); }
});

router.delete("/admin/hero-banners/:id", async (req, res) => {
  try {
    const id = idSchema.parse(req.params.id);
    const [row] = await db.transaction(async tx => {
      const [current] = await tx.select().from(heroBanners).where(eq(heroBanners.id, id)).for("update");
      if (!current) return [];
      await tx.delete(heroBanners).where(eq(heroBanners.id, id));
      await enqueueBannerCleanup(tx, current.desktopImagePath);
      await enqueueBannerCleanup(tx, current.mobileImagePath);
      return [current];
    });
    if (!row) return res.status(404).json({ message: "Banner not found" });
    await drainBannerCleanupQueue();
    return res.status(204).end();
  } catch (error) { return badInput(res, error); }
});

router.get("/admin/hero-banners/:id/images/:variant", async (req, res) => {
  try { await serveImage(req, res, true); } catch (error) { if (error instanceof z.ZodError) return badInput(res, error); res.status(404).json({ message: "Banner image not found" }); }
});

router.post("/admin/hero-banners/:id/images/:variant", parseUpload, async (req, res) => {
  let oldPath: string | null = null;
  let newPath: string | null = null;
  try {
    const id = idSchema.parse(req.params.id);
    const variant = variantSchema.parse(req.params.variant);
    if (!req.file) return res.status(400).json({ message: "An image file is required" });
    const metadata = await sharp(req.file.buffer, { limitInputPixels: 25_000_000, failOn: "error" }).metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) return res.status(400).json({ message: "Only JPEG, PNG, and WebP images are supported" });
    const data = await sharp(req.file.buffer, { limitInputPixels: 25_000_000, failOn: "error" }).rotate().webp({ quality: 85 }).toBuffer();
    newPath = await saveBannerImage(id, variant, data);
    const [updated] = await db.transaction(async tx => {
      const [current] = await tx.select().from(heroBanners).where(eq(heroBanners.id, id)).for("update");
      if (!current) return [];
      oldPath = variant === "desktop" ? current.desktopImagePath : current.mobileImagePath;
      const result = await tx.update(heroBanners).set({
        ...(variant === "desktop" ? { desktopImagePath: newPath } : { mobileImagePath: newPath }),
        updatedAt: new Date(),
      }).where(eq(heroBanners.id, id)).returning();
      await enqueueBannerCleanup(tx, oldPath);
      return result;
    });
    if (!updated) { await disposeBannerPath(newPath); return res.status(404).json({ message: "Banner not found" }); }
    await drainBannerCleanupQueue();
    res.json(adminProjection(updated));
  } catch (error) {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") return res.status(413).json({ message: "Image must be 8 MiB or smaller" });
    if (error instanceof z.ZodError) return badInput(res, error);
    if (newPath) await disposeBannerPath(newPath);
    res.status(400).json({ message: error instanceof Error ? error.message : "Unable to process image" });
  }
});

router.put("/admin/hero-banners/reorder", async (req, res) => {
  try {
    const { ids } = reorderBody.parse(req.body);
    if (new Set(ids).size !== ids.length) return res.status(400).json({ message: "ids must not contain duplicates" });
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('hero-banners-order'))`);
      const rows = await tx.select({ id: heroBanners.id, sortOrder: heroBanners.sortOrder }).from(heroBanners).for("update");
      const known = new Set(rows.map(row => row.id));
      if (ids.length !== known.size || ids.some(id => !known.has(id))) throw new Error("ids must contain every banner exactly once");
      const currentMaximum = rows.reduce((maximum, row) => Math.max(maximum, row.sortOrder), -1);
      const temporaryOffset = currentMaximum + rows.length + 1;
      await tx.update(heroBanners).set({ sortOrder: sql`${heroBanners.sortOrder} + ${temporaryOffset}` });
      for (const [sortOrder, id] of ids.entries()) {
        await tx.update(heroBanners).set({ sortOrder, updatedAt: new Date() }).where(eq(heroBanners.id, id));
      }
    });
    const rows = await db.select().from(heroBanners).orderBy(asc(heroBanners.sortOrder), asc(heroBanners.id));
    res.json(rows.map(adminProjection));
  } catch (error) { return badInput(res, error); }
});

export default router;