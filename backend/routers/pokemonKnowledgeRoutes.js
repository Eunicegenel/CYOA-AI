import express from "express";

import {
  getKnowledgeStats,
  getPokemonRecord,
  getMoveRecord,
  getAbilityRecord,
  getItemRecord,
  checkPokemonCanLearnMove,
  searchAnimeLoreRecords,
  searchMangaLoreRecords,
} from "../controllers/pokemonKnowledgeController.js";

const router = express.Router();

router.get("/stats", getKnowledgeStats);

router.get("/pokemon/:name", getPokemonRecord);
router.get("/move/:name", getMoveRecord);
router.get("/ability/:name", getAbilityRecord);
router.get("/item/:name", getItemRecord);

router.get(
  "/can-learn/:pokemonName/:moveName",
  checkPokemonCanLearnMove
);

router.get("/lore/anime", searchAnimeLoreRecords);
router.get("/lore/manga", searchMangaLoreRecords);

export default router;
