import { Router, type IRouter } from "express";
import { db, categoriesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/categories", async (_req, res) => {
  try {
    const categories = await db.select().from(categoriesTable);
    res.json(categories);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch categories" });
  }
});

export default router;
