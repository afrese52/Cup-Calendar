import { Router, type IRouter } from "express";
import eventsRouter from "./events";
import healthRouter from "./health";
import adminImportRouter from "./adminImport";
import accountDeletionRouter from "./accountDeletion";
import searchConsoleRouter from "./searchConsole";

const router: IRouter = Router();

router.use(healthRouter);
router.use(eventsRouter);
router.use(adminImportRouter);
router.use(accountDeletionRouter);
router.use(searchConsoleRouter);

export default router;
