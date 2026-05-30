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
import { buildPokemonPromptContext } from "../services/pokemonPromptContextService.js";

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

function cleanAssistantReplyForChat(reply = "") {
  let text = String(reply || "")
    .replace(/\r\n/g, "\n")
    .trim();

  const lowerText = text.toLowerCase();
  const lastThinkCloseIndex = lowerText.lastIndexOf("</think>");

  if (lastThinkCloseIndex !== -1) {
    text = text.slice(lastThinkCloseIndex + "</think>".length).trim();
  }

  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  text = text.replace(/<think>[\s\S]*$/gi, "").trim();
  text = text
    .replace(/^\s*(final answer|final response|final scene|scene|output)\s*:\s*/i, "")
    .trim();

  const lines = text.split("\n");

  const reasoningLinePatterns = [
    /^\s*the user wants\b/i,
    /^\s*the user said\b/i,
    /^\s*i need to\b/i,
    /^\s*i should\b/i,
    /^\s*i'll\b/i,
    /^\s*i will\b/i,
    /^\s*i think\b/i,
    /^\s*hmm\b/i,
    /^\s*wait\b/i,
    /^\s*alternatively\b/i,
    /^\s*to be safe\b/i,
    /^\s*for the scene\b/i,
    /^\s*also,\s*/i,
    /^\s*but note\b/i,
    /^\s*this gives the user\b/i,
    /^\s*let me\b/i,
    /^\s*important:\b/i,
    /^\s*this is the output\b/i,
    /^\s*so:\s*$/i,
  ];

  // Remove leading reasoning lines.
  let firstGoodLineIndex = 0;

  while (
    firstGoodLineIndex < lines.length &&
    (
      !lines[firstGoodLineIndex].trim() ||
      reasoningLinePatterns.some((pattern) =>
        pattern.test(lines[firstGoodLineIndex])
      )
    )
  ) {
    firstGoodLineIndex += 1;
  }

  text = lines.slice(firstGoodLineIndex).join("\n").trim();

  // Cut off trailing reasoning if it appears after a good answer.
  const trailingMetaPatterns = [
    /\n\s*this gives the user\b/i,
    /\n\s*but note\b/i,
    /\n\s*also,\s*/i,
    /\n\s*i think\b/i,
    /\n\s*let me\b/i,
    /\n\s*important:\b/i,
    /\n\s*this is the output\b/i,
    /\n\s*the user said\b/i,
    /\n\s*the user wants\b/i,
    /\n\s*i need to\b/i,
    /\n\s*i should\b/i,
    /\n\s*wait\b/i,
    /\n\s*hmm\b/i,
  ];

  let cutIndex = -1;

  for (const pattern of trailingMetaPatterns) {
    const match = text.match(pattern);

    if (match?.index !== undefined) {
      cutIndex = cutIndex === -1 ? match.index : Math.min(cutIndex, match.index);
    }
  }

  if (cutIndex !== -1) {
    text = text.slice(0, cutIndex).trim();
  }

  const cleanedLines = text.split("\n");
  const lastChoiceIndex = cleanedLines.reduce((lastIndex, line, index) => {
    return /^\s*[A-Z]\)\s+/.test(line) ? index : lastIndex;
  }, -1);

  if (lastChoiceIndex !== -1) {
    text = cleanedLines.slice(0, lastChoiceIndex + 1).join("\n").trim();
  }

  return text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
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

    const pokemonPromptContext = buildPokemonPromptContext({
      message,
      history,
      mode,
    });

    const systemPrompt = `
    ${selectedConfig.behavior}

    OUTPUT CONTRACT:
    Your visible reply must contain only the final user-facing response.
    Start directly with the answer, scene, or action.
    Never include planning notes, decision notes, hidden reasoning, self-talk, or analysis.
    Never write phrases like "the user wants", "I need to", "I should", "wait", "hmm", "final scene", or "let me".

    ${localComputerContext}

    ${pokemonPromptContext}
    `.trim();

    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...history.slice(-20),
      {
        role: "user",
        content: `/no_think\n${message}`,
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

        // Keep normal generation, but do not expose thinking text.
        think: false,

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

    const rawAssistantReply =
      data?.message?.content ||
      data?.response ||
      "";

    const assistantReply =
      cleanAssistantReplyForChat(rawAssistantReply) ||
      "I could not generate a clean response. Please try again.";

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
