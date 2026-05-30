import "dotenv/config";
import express from "express";
import cors from "cors";

import healthRoutes from "./routers/healthRoutes.js";
import modelRoutes from "./routers/modelRoutes.js";
import chatRoutes from "./routers/chatRoutes.js";
import alarmRoutes from "./routers/alarmRoutes.js";
import pokemonKnowledgeRoutes from "./routers/pokemonKnowledgeRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5050;

app.use("/", healthRoutes);
app.use("/api/models", modelRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/alarms", alarmRoutes);
app.use("/api/pokemon-knowledge", pokemonKnowledgeRoutes);

app.listen(PORT, () => {
  console.log(`CYOA Brain v0 running on http://localhost:${PORT}`);
});
