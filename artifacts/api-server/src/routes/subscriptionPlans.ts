import { Router, type IRouter } from "express";
import { db, subscriptionPlansTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/subscription-plans", async (_req, res) => {
  try {
    const plans = await db.select().from(subscriptionPlansTable);
    res.json(plans);
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to fetch plans" });
  }
});

export default router;
