import {
  getPokemonByName,
  getMoveByName,
  getAbilityByName,
  getItemByName,
  canPokemonLearnMove,
  searchAnimeLore,
  searchMangaLore,
  getPokemonKnowledgeStats,
} from "../services/pokemonKnowledgeService.js";

export function getKnowledgeStats(req, res) {
  try {
    return res.json({
      success: true,
      data: getPokemonKnowledgeStats(),
    });
  } catch (error) {
    console.error("Failed to get Pokémon knowledge stats:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to get Pokémon knowledge stats.",
    });
  }
}

export function getPokemonRecord(req, res) {
  try {
    const { name } = req.params;
    const pokemon = getPokemonByName(name);

    if (!pokemon) {
      return res.status(404).json({
        success: false,
        error: `Pokémon not found: ${name}`,
      });
    }

    return res.json({
      success: true,
      data: pokemon,
    });
  } catch (error) {
    console.error("Failed to get Pokémon record:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to get Pokémon record.",
    });
  }
}

export function getMoveRecord(req, res) {
  try {
    const { name } = req.params;
    const move = getMoveByName(name);

    if (!move) {
      return res.status(404).json({
        success: false,
        error: `Move not found: ${name}`,
      });
    }

    return res.json({
      success: true,
      data: move,
    });
  } catch (error) {
    console.error("Failed to get move record:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to get move record.",
    });
  }
}

export function getAbilityRecord(req, res) {
  try {
    const { name } = req.params;
    const ability = getAbilityByName(name);

    if (!ability) {
      return res.status(404).json({
        success: false,
        error: `Ability not found: ${name}`,
      });
    }

    return res.json({
      success: true,
      data: ability,
    });
  } catch (error) {
    console.error("Failed to get ability record:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to get ability record.",
    });
  }
}

export function getItemRecord(req, res) {
  try {
    const { name } = req.params;
    const item = getItemByName(name);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: `Item not found: ${name}`,
      });
    }

    return res.json({
      success: true,
      data: item,
    });
  } catch (error) {
    console.error("Failed to get item record:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to get item record.",
    });
  }
}

export function checkPokemonCanLearnMove(req, res) {
  try {
    const { pokemonName, moveName } = req.params;

    const result = canPokemonLearnMove(pokemonName, moveName);

    return res.json({
      success: true,
      data: {
        pokemonName,
        moveName,
        ...result,
      },
    });
  } catch (error) {
    console.error("Failed to check Pokémon learnset:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to check Pokémon learnset.",
    });
  }
}

export function searchAnimeLoreRecords(req, res) {
  try {
    const query = String(req.query.q ?? "").trim();
    const limit = Number(req.query.limit ?? 5);

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Query parameter 'q' is required.",
      });
    }

    const results = searchAnimeLore(
      query,
      Number.isFinite(limit) ? limit : 5
    );

    return res.json({
      success: true,
      query,
      count: results.length,
      data: results,
    });
  } catch (error) {
    console.error("Failed to search anime lore:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to search anime lore.",
    });
  }
}

export function searchMangaLoreRecords(req, res) {
  try {
    const query = String(req.query.q ?? "").trim();
    const limit = Number(req.query.limit ?? 5);

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Query parameter 'q' is required.",
      });
    }

    const results = searchMangaLore(
      query,
      Number.isFinite(limit) ? limit : 5
    );

    return res.json({
      success: true,
      query,
      count: results.length,
      data: results,
    });
  } catch (error) {
    console.error("Failed to search manga lore:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to search manga lore.",
    });
  }
}
