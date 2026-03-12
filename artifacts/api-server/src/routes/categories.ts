import { Router, type IRouter } from "express";
import { db, categoriesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/categories", async (_req, res) => {
  try {
    const categories = await db.select().from(categoriesTable);
    res.json(categories);
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" || "Failed to fetch categories" });
  }
});

export default router;
