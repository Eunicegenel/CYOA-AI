import "dotenv/config";
import express from "express";
import cors from "cors";
import { SYSTEM_BEHAVIOR } from "./src/behavior.js";

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5050;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/chat";
const MODEL = process.env.OLLAMA_MODEL || "qwen3:4b";

const conversations = new Map();

app.get("/", (req, res) => {
  res.json({
    app: "CYOA Brain v0",
    status: "running",
    model: MODEL,
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { message, conversationId = "default" } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Message is required and must be a string.",
      });
    }

    const history = conversations.get(conversationId) || [];

    const messages = [
      {
        role: "system",
        content: SYSTEM_BEHAVIOR,
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
        model: MODEL,
        messages,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
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

    conversations.set(conversationId, updatedHistory);

    return res.json({
      conversationId,
      model: MODEL,
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
  const { conversationId = "default" } = req.body || {};

  conversations.delete(conversationId);

  return res.json({
    message: "Conversation reset.",
    conversationId,
  });
});

app.listen(PORT, () => {
  console.log(`CYOA Brain v0 running on http://localhost:${PORT}`);
});
