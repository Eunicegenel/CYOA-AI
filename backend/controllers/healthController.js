import { MODEL_CONFIG } from "../models/modelConfig.js";

export function getHealth(req, res) {
  return res.json({
    app: "CYOA Brain v0",
    status: "running",
    models: MODEL_CONFIG,
  });
}
