import express from "express";
import { getModels } from "../controllers/modelController.js";

const router = express.Router();

router.get("/", getModels);

export default router;
