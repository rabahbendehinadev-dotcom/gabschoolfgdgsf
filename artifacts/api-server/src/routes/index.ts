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
import communityRouter from "./community";
import usersRouter from "./users";
import notificationsRouter from "./notifications";
import toolsRouter from "./tools";
import solutionsRouter from "./solutions";
import heroBannersRouter from "./heroBanners";

const router: IRouter = Router();

router.use(healthRouter);
router.use(solutionsRouter);
router.use(heroBannersRouter);
router.use(authRouter);
router.use(videosRouter);
router.use(categoriesRouter);
router.use(playlistsRouter);
router.use(subscriptionPlansRouter);
router.use(adminRouter);
router.use(storageRouter);
router.use(paymentsRouter);
router.use(communityRouter);
router.use(usersRouter);
router.use(notificationsRouter);
router.use(toolsRouter);

export default router;
