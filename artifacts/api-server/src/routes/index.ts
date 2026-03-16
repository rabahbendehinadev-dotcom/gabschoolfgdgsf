import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import videosRouter from "./videos";
import categoriesRouter from "./categories";
import playlistsRouter from "./playlists";
import subscriptionPlansRouter from "./subscriptionPlans";
import adminRouter from "./admin";
import storageRouter from "./storage";
import paymentsRouter from "./payments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(videosRouter);
router.use(categoriesRouter);
router.use(playlistsRouter);
router.use(subscriptionPlansRouter);
router.use(adminRouter);
router.use(storageRouter);
router.use(paymentsRouter);

export default router;
