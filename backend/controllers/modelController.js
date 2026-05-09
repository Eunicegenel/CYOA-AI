import { MODEL_CONFIG } from "../models/modelConfig.js";

export function getModels(req, res) {
  const models = Object.entries(MODEL_CONFIG).map(([key, value]) => ({
    key,
    label: value.label,
    model: value.model,
  }));

  return res.json({ models });
}
