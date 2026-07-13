import { Router, type IRouter } from "express";
import healthRouter from "./health";
import editalRouter from "./edital";
import resourcesRouter from "./resources";

const router: IRouter = Router();

router.use(healthRouter);
router.use(editalRouter);
router.use(resourcesRouter);

export default router;
