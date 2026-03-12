import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import videosRouter from "./videos";
import categoriesRouter from "./categories";
import subscriptionPlansRouter from "./subscriptionPlans";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(videosRouter);
router.use(categoriesRouter);
router.use(subscriptionPlansRouter);
router.use(adminRouter);

export default router;
