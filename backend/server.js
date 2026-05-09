import "dotenv/config";
import express from "express";
import cors from "cors";
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
