import { SYSTEM_BEHAVIORS } from "../src/behavior.js";

export const MODEL_CONFIG = {
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
