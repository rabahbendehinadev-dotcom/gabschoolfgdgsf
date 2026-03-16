import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db, paymentSubmissionsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { adminAuth } from "../middlewares/auth";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { Readable } from "stream";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const SubmitPaymentBody = z.object({
  customerName: z.string().min(1),
  planType: z.string().min(1),
  planPrice: z.string().min(1),
  paymentMethod: z.string().min(1),
  proofObjectPath: z.string().optional().nullable(),
  userId: z.number().optional().nullable(),
});

router.post("/payments/submit", async (req: Request, res: Response) => {
  const parsed = SubmitPaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "بيانات غير صحيحة" });
    return;
  }
  try {
    const { customerName, planType, planPrice, paymentMethod, proofObjectPath, userId } = parsed.data;
    const [submission] = await db.insert(paymentSubmissionsTable).values({
      customerName,
      planType,
      planPrice,
      paymentMethod,
      proofObjectPath: proofObjectPath ?? null,
      userId: userId ?? null,
      status: "pending",
    }).returning();
    res.status(201).json({ id: submission.id, message: "تم إرسال الطلب بنجاح" });
  } catch (error) {
    console.error("Payment submit error:", error);
    res.status(500).json({ message: "حدث خطأ" });
  }
});

router.get("/payments/proof/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [submission] = await db.select().from(paymentSubmissionsTable)
      .where(eq(paymentSubmissionsTable.id, id)).limit(1);
    if (!submission || !submission.proofObjectPath) {
      res.status(404).json({ message: "الإثبات غير موجود" });
      return;
    }
    const objectFile = await objectStorageService.getObjectEntityFile(submission.proofObjectPath);
    const response = await objectStorageService.downloadObject(objectFile);
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    if (response.body) {
      Readable.fromWeb(response.body as import("stream/web").ReadableStream).pipe(res);
    } else {
      res.status(404).end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ message: "الملف غير موجود" });
    } else {
      res.status(500).json({ message: "حدث خطأ" });
    }
  }
});

router.get("/admin/payments", adminAuth, async (_req: Request, res: Response) => {
  try {
    const submissions = await db.select().from(paymentSubmissionsTable)
      .orderBy(desc(paymentSubmissionsTable.createdAt));
    res.json(submissions.map(s => ({
      id: s.id,
      customerName: s.customerName,
      planType: s.planType,
      planPrice: s.planPrice,
      paymentMethod: s.paymentMethod,
      proofObjectPath: s.proofObjectPath,
      status: s.status,
      notes: s.notes,
      userId: s.userId,
      createdAt: s.createdAt.toISOString(),
      proofUrl: s.proofObjectPath ? `/api/payments/proof/${s.id}` : null,
    })));
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ" });
  }
});

router.patch("/admin/payments/:id", adminAuth, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { status, notes } = z.object({
      status: z.enum(["pending", "approved", "rejected"]).optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    const [updated] = await db.update(paymentSubmissionsTable)
      .set(updateData)
      .where(eq(paymentSubmissionsTable.id, id))
      .returning();
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: "حدث خطأ" });
  }
});

export default router;
