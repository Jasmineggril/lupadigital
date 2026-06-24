import { Router, type IRouter } from "express";
import healthRouter from "./health";
import editalRouter from "./edital";

const router: IRouter = Router();

router.use(healthRouter);
router.use(editalRouter);

export default router;
