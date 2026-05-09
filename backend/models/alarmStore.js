import crypto from "node:crypto";

const MAX_ALARM_DELAY_MS = 2_147_483_647;

const alarmClients = new Set();
const alarms = new Map();

export function serializeAlarm(alarm) {
  return {
    id: alarm.id,
    label: alarm.label,
    triggerAt: alarm.triggerAt,
    createdAt: alarm.createdAt,
  };
}

export function sendAlarmEvent(eventName, payload) {
  const eventPayload = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const client of alarmClients) {
    client.write(eventPayload);
  }
}

export function addAlarmClient(client) {
  alarmClients.add(client);
}

export function removeAlarmClient(client) {
  alarmClients.delete(client);
}

export function getActiveAlarms() {
  return [...alarms.values()]
    .map(serializeAlarm)
    .sort((a, b) => new Date(a.triggerAt) - new Date(b.triggerAt));
}

export function createAlarm({ triggerAt, label = "Alarm" }) {
  const triggerDate = new Date(triggerAt);
  const delay = triggerDate.getTime() - Date.now();

  if (!Number.isFinite(delay) || delay <= 0) {
    throw new Error("Alarm time must be in the future.");
  }

  if (delay > MAX_ALARM_DELAY_MS) {
    throw new Error("For now, alarms can only be set up to about 24 days ahead.");
  }

  const id = crypto.randomUUID();

  const alarm = {
    id,
    label: String(label || "Alarm").slice(0, 100),
    triggerAt: triggerDate.toISOString(),
    createdAt: new Date().toISOString(),
    timeout: null,
  };

  alarm.timeout = setTimeout(() => {
    const currentAlarm = alarms.get(id);

    if (!currentAlarm) return;

    alarms.delete(id);
    sendAlarmEvent("alarm", serializeAlarm(currentAlarm));
  }, delay);

  alarms.set(id, alarm);

  return serializeAlarm(alarm);
}

export function deleteAlarm(id) {
  const alarm = alarms.get(id);

  if (!alarm) {
    return null;
  }

  clearTimeout(alarm.timeout);
  alarms.delete(id);

  return serializeAlarm(alarm);
}
