import { Router, type IRouter } from "express";
import healthRouter from "./health";
import editalRouter from "./edital";
import resourcesRouter from "./resources";
import niasciRouter from "./niasci";

const router: IRouter = Router();

router.use(healthRouter);
router.use(editalRouter);
router.use(niasciRouter);   // antes do resourcesRouter (que tem requireAuth global)
router.use(resourcesRouter);

export default router;
