import { Router, type IRouter } from "express";
import eventsRouter from "./events";
import healthRouter from "./health";
import adminImportRouter from "./adminImport";

const router: IRouter = Router();

router.use(healthRouter);
router.use(eventsRouter);
router.use(adminImportRouter);

export default router;
