import { Router, type IRouter } from "express";
import { db, subscriptionPlansTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/subscription-plans", async (_req, res) => {
  try {
    const plans = await db.select().from(subscriptionPlansTable);
    res.json(plans);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch plans" });
  }
});

export default router;
