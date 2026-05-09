import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import { SYSTEM_BEHAVIORS } from "./src/behavior.js";
import { buildLocalComputerContext } from "./localComputerContext.js";

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5050;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/chat";

const MODEL_CONFIG = {
  assistant: {
    label: "Assistant",
    model: process.env.OLLAMA_ASSISTANT_MODEL || "qwen3:4b",
    behavior: SYSTEM_BEHAVIORS.assistant,
  },
  story: {
    label: "Story",
    model: process.env.OLLAMA_STORY_MODEL || "qwen3:4b",
    behavior: SYSTEM_BEHAVIORS.story,
  },
  adultStory: {
    label: "Adult Story",
    model: process.env.OLLAMA_ADULT_STORY_MODEL || "dolphin-mistral",
    behavior: SYSTEM_BEHAVIORS.adultStory,
  },
};

const conversations = new Map();
const alarmClients = new Set();
const alarms = new Map();

const MAX_ALARM_DELAY_MS = 2_147_483_647;

function serializeAlarm(alarm) {
  return {
    id: alarm.id,
    label: alarm.label,
    triggerAt: alarm.triggerAt,
    createdAt: alarm.createdAt,
  };
}

function sendAlarmEvent(eventName, payload) {
  const eventPayload = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const client of alarmClients) {
    client.write(eventPayload);
  }
}

function createAlarm({ triggerAt, label = "Alarm" }) {
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

function parseAlarmRequest(message = "") {
  const text = String(message).trim();

  const hasAlarmKeyword = /\b(alarm|timer|remind me|wake me)\b/i.test(text);

  if (!hasAlarmKeyword) return null;

  if (/\b(show|list|what|active|upcoming)\b/i.test(text)) {
    return {
      action: "list",
    };
  }

  if (/\b(cancel|delete|remove)\b/i.test(text)) {
    return {
      action: "unsupportedCancel",
    };
  }

  const now = new Date();
  let triggerAt = null;

  const relativeMatch = text.match(
    /\b(?:in|after|for)\s+(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/i
  );

  if (relativeMatch) {
    const amount = Number(relativeMatch[1]);
    const unit = relativeMatch[2].toLowerCase();

    let multiplier = 1000;

    if (unit.startsWith("min")) {
      multiplier = 60 * 1000;
    } else if (unit.startsWith("hour") || unit.startsWith("hr")) {
      multiplier = 60 * 60 * 1000;
    }

    triggerAt = new Date(Date.now() + amount * multiplier);
  }

  if (!triggerAt) {
    const absoluteMatch = text.match(
      /\b(?:at|for|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i
    );

    if (absoluteMatch) {
      let hour = Number(absoluteMatch[1]);
      const minute = Number(absoluteMatch[2] || 0);
      const meridian = absoluteMatch[3]?.toLowerCase();

      if (minute < 0 || minute > 59) {
        return {
          action: "invalid",
          reason: "Minutes must be between 0 and 59.",
        };
      }

      if (meridian === "pm" && hour < 12) hour += 12;
      if (meridian === "am" && hour === 12) hour = 0;

      if (hour < 0 || hour > 23) {
        return {
          action: "invalid",
          reason: "Hour must be between 1 and 12, or 0 and 23.",
        };
      }

      triggerAt = new Date();
      triggerAt.setHours(hour, minute, 0, 0);

      if (triggerAt <= now) {
        triggerAt.setDate(triggerAt.getDate() + 1);
      }
    }
  }

  if (!triggerAt) {
    return {
      action: "needsTime",
    };
  }

  let label = "Alarm";

  const relativeLabelMatch = text.match(
    /\b(?:in|after|for)\s+\d+\s*(?:seconds?|secs?|minutes?|mins?|hours?|hrs?)\s+(?:to|called|named|saying)\s+(.+)$/i
  );

  const absoluteLabelMatch = text.match(
    /\b(?:at|for|by)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s+(?:to|called|named|saying)\s+(.+)$/i
  );

  const labelMatch = relativeLabelMatch || absoluteLabelMatch;

  if (labelMatch?.[1]) {
    label = labelMatch[1].trim();
  }

  return {
    action: "create",
    triggerAt,
    label,
  };
}

const getConversationKey = ({ conversationId, mode }) => {
  return `${mode}:${conversationId}`;
};

app.get("/", (req, res) => {
  res.json({
    app: "CYOA Brain v0",
    status: "running",
    models: MODEL_CONFIG,
  });
});

app.get("/api/models", (req, res) => {
  const models = Object.entries(MODEL_CONFIG).map(([key, value]) => ({
    key,
    label: value.label,
    model: value.model,
  }));

  return res.json({ models });
});

app.get("/api/alarms/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.flushHeaders?.();

  alarmClients.add(res);

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
    alarmClients.delete(res);
    res.end();
  });
});

app.get("/api/alarms", (req, res) => {
  const activeAlarms = [...alarms.values()]
    .map(serializeAlarm)
    .sort((a, b) => new Date(a.triggerAt) - new Date(b.triggerAt));

  return res.json({
    alarms: activeAlarms,
  });
});

app.post("/api/alarms", (req, res) => {
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
});

app.delete("/api/alarms/:id", (req, res) => {
  const alarm = alarms.get(req.params.id);

  if (!alarm) {
    return res.status(404).json({
      error: "Alarm not found.",
    });
  }

  clearTimeout(alarm.timeout);
  alarms.delete(req.params.id);

  return res.json({
    message: "Alarm deleted.",
    alarm: serializeAlarm(alarm),
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const {
      message,
      conversationId = "default",
      mode = "assistant",
    } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Message is required and must be a string.",
      });
    }

    const selectedConfig = MODEL_CONFIG[mode];

    if (!selectedConfig) {
      return res.status(400).json({
        error: "Invalid mode selected.",
        allowedModes: Object.keys(MODEL_CONFIG),
      });
    }

    const conversationKey = getConversationKey({ conversationId, mode });
    const history = conversations.get(conversationKey) || [];

    const alarmIntent = parseAlarmRequest(message);

    if (alarmIntent) {
      let assistantReply = "";

      if (alarmIntent.action === "create") {
        try {
          const alarm = createAlarm({
            triggerAt: alarmIntent.triggerAt,
            label: alarmIntent.label,
          });

          assistantReply = `Alarm set for ${new Date(
            alarm.triggerAt
          ).toLocaleString()}.\nLabel: ${alarm.label}`;
        } catch (error) {
          assistantReply = `I could not set the alarm. ${error.message}`;
        }
      }

      if (alarmIntent.action === "list") {
        const activeAlarms = [...alarms.values()]
          .map(serializeAlarm)
          .sort((a, b) => new Date(a.triggerAt) - new Date(b.triggerAt));

        assistantReply =
          activeAlarms.length > 0
            ? activeAlarms
                .map(
                  (alarm, index) =>
                    `${index + 1}) ${alarm.label} - ${new Date(
                      alarm.triggerAt
                    ).toLocaleString()}`
                )
                .join("\n")
            : "There are no active alarms.";
      }

      if (alarmIntent.action === "needsTime") {
        assistantReply =
          "Tell me when to set the alarm. Example: set an alarm in 10 minutes, or set an alarm at 7:30 PM.";
      }

      if (alarmIntent.action === "invalid") {
        assistantReply = `I could not set the alarm. ${alarmIntent.reason}`;
      }

      if (alarmIntent.action === "unsupportedCancel") {
        assistantReply =
          "Alarm cancellation by chat is not enabled yet. For now, alarms can be dismissed when they ring.";
      }

      const updatedHistory = [
        ...history,
        {
          role: "user",
          content: message,
        },
        {
          role: "assistant",
          content: assistantReply,
        },
      ];

      conversations.set(conversationKey, updatedHistory);

      return res.json({
        conversationId,
        mode,
        model: selectedConfig.model,
        reply: assistantReply,
      });
    }

    const localComputerContext = buildLocalComputerContext(message);

    const systemPrompt = `
      ${selectedConfig.behavior}

      ${localComputerContext}
      `.trim();

    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...history.slice(-20),
      {
        role: "user",
        content: message,
      },
    ];

    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: selectedConfig.model,
        messages,
        stream: false,
        options: {
          temperature: mode === "story" ? 0.9 : 0.7,
          top_p: mode === "story" ? 0.95 : 0.9,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      return res.status(502).json({
        error: "Failed to get a response from Ollama.",
        details: errorText,
      });
    }

    const data = await response.json();
    const assistantReply = data?.message?.content || "";

    const updatedHistory = [
      ...history,
      {
        role: "user",
        content: message,
      },
      {
        role: "assistant",
        content: assistantReply,
      },
    ];

    conversations.set(conversationKey, updatedHistory);

    return res.json({
      conversationId,
      mode,
      model: selectedConfig.model,
      reply: assistantReply,
    });
  } catch (error) {
    console.error("Chat error:", error);

    return res.status(500).json({
      error: "Internal server error.",
      details: error.message,
    });
  }
});

app.post("/api/chat/reset", (req, res) => {
  const {
    conversationId = "default",
    mode = "assistant",
  } = req.body || {};

  const conversationKey = getConversationKey({ conversationId, mode });

  conversations.delete(conversationKey);

  return res.json({
    message: "Conversation reset.",
    conversationId,
    mode,
  });
});

app.listen(PORT, () => {
  console.log(`CYOA Brain v0 running on http://localhost:${PORT}`);
});
