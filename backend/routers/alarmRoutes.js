import express from "express";
import {
  addAlarm,
  listAlarms,
  removeAlarm,
  streamAlarmEvents,
} from "../controllers/alarmController.js";

const router = express.Router();

router.get("/", listAlarms);
router.post("/", addAlarm);
router.delete("/:id", removeAlarm);
router.get("/events", streamAlarmEvents);

export default router;
