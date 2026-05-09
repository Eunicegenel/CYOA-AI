import express from "express";
import {
  resetChat,
  sendChatMessage,
} from "../controllers/chatController.js";

const router = express.Router();

router.post("/", sendChatMessage);
router.post("/reset", resetChat);

export default router;
