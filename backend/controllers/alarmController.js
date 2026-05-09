import {
  addAlarmClient,
  createAlarm,
  deleteAlarm,
  getActiveAlarms,
  removeAlarmClient,
} from "../models/alarmStore.js";

export function streamAlarmEvents(req, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.flushHeaders?.();

  addAlarmClient(res);

  res.write(
    `event: connected\ndata: ${JSON.stringify({
      status: "connected",
    })}\n\n`
  );

  const keepAlive = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAlive);
    removeAlarmClient(res);
    res.end();
  });
}

export function listAlarms(req, res) {
  return res.json({
    alarms: getActiveAlarms(),
  });
}

export function addAlarm(req, res) {
  try {
    const { triggerAt, label } = req.body || {};

    const alarm = createAlarm({
      triggerAt,
      label,
    });

    return res.json({
      message: "Alarm set.",
      alarm,
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message,
    });
  }
}

export function removeAlarm(req, res) {
  const alarm = deleteAlarm(req.params.id);

  if (!alarm) {
    return res.status(404).json({
      error: "Alarm not found.",
    });
  }

  return res.json({
    message: "Alarm deleted.",
    alarm,
  });
}
