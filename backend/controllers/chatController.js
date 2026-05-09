import { MODEL_CONFIG } from "../models/modelConfig.js";
import {
  getConversationHistory,
  resetConversation,
  setConversationHistory,
} from "../models/conversationStore.js";
import {
  createAlarm,
  getActiveAlarms,
} from "../models/alarmStore.js";
import { buildLocalComputerContext } from "../localComputerContext.js";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/chat";

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

function saveChatTurn({ conversationId, mode, history, userMessage, assistantReply }) {
  const updatedHistory = [
    ...history,
    {
      role: "user",
      content: userMessage,
    },
    {
      role: "assistant",
      content: assistantReply,
    },
  ];

  setConversationHistory({
    conversationId,
    mode,
    history: updatedHistory,
  });
}

export async function sendChatMessage(req, res) {
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

    const history = getConversationHistory({
      conversationId,
      mode,
    });

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
        const activeAlarms = getActiveAlarms();

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

      saveChatTurn({
        conversationId,
        mode,
        history,
        userMessage: message,
        assistantReply,
      });

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

    saveChatTurn({
      conversationId,
      mode,
      history,
      userMessage: message,
      assistantReply,
    });

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
}

export function resetChat(req, res) {
  const {
    conversationId = "default",
    mode = "assistant",
  } = req.body || {};

  resetConversation({
    conversationId,
    mode,
  });

  return res.json({
    message: "Conversation reset.",
    conversationId,
    mode,
  });
}
