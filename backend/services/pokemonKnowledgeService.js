import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NORMALIZED_ROOT = path.join(
  __dirname,
  "../data/pokemon/normalized"
);

const DATA_FILES = {
  pokemon: path.join(NORMALIZED_ROOT, "pokemon.json"),
  moves: path.join(NORMALIZED_ROOT, "moves.json"),
  abilities: path.join(NORMALIZED_ROOT, "abilities.json"),
  items: path.join(NORMALIZED_ROOT, "items.json"),
  types: path.join(NORMALIZED_ROOT, "types.json"),
  evolutions: path.join(NORMALIZED_ROOT, "evolutions.json"),
  learnsets: path.join(NORMALIZED_ROOT, "learnsets.json"),
  animeLoreChunks: path.join(
    NORMALIZED_ROOT,
    "lore/anime/chunks.json"
  ),
  mangaLoreChunks: path.join(
    NORMALIZED_ROOT,
    "lore/manga/chunks.json"
  ),
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeSearchText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompactKey(value = "") {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

function tokenize(value = "") {
  return normalizeSearchText(value)
    .split(" ")
    .filter((token) => token.length > 1);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function countOccurrences(haystack = "", needle = "") {
  if (!haystack || !needle) return 0;

  let count = 0;
  let startIndex = 0;

  while (true) {
    const index = haystack.indexOf(needle, startIndex);

    if (index === -1) break;

    count += 1;
    startIndex = index + needle.length;
  }

  return count;
}

console.log("Loading normalized Pokémon knowledge data...");

const pokemonRecords = readJson(DATA_FILES.pokemon);
const moveRecords = readJson(DATA_FILES.moves);
const abilityRecords = readJson(DATA_FILES.abilities);
const itemRecords = readJson(DATA_FILES.items);
const typeRecords = readJson(DATA_FILES.types);
const evolutionRecords = readJson(DATA_FILES.evolutions);
const learnsetRecords = readJson(DATA_FILES.learnsets);
const animeLoreChunks = readJson(DATA_FILES.animeLoreChunks);
const mangaLoreChunks = readJson(DATA_FILES.mangaLoreChunks);

console.log("Pokémon knowledge data loaded.");

const pokemonByCompactKey = new Map();
const movesByCompactKey = new Map();
const abilitiesByCompactKey = new Map();
const itemsByCompactKey = new Map();
const typesByCompactKey = new Map();
const learnsetsByCompactPokemonKey = new Map();

function addToLookup(map, key, record) {
  const normalizedKey = normalizeCompactKey(key);

  if (!normalizedKey) return;

  if (!map.has(normalizedKey)) {
    map.set(normalizedKey, []);
  }

  map.get(normalizedKey).push(record);
}

for (const pokemon of pokemonRecords) {
  addToLookup(
    pokemonByCompactKey,
    pokemon?.identity?.displayName,
    pokemon
  );

  addToLookup(
    pokemonByCompactKey,
    pokemon?.identity?.pokeapiSlug,
    pokemon
  );

  addToLookup(
    pokemonByCompactKey,
    pokemon?.identity?.showdownKey,
    pokemon
  );

  addToLookup(
    pokemonByCompactKey,
    pokemon?.matchKey,
    pokemon
  );
}

for (const move of moveRecords) {
  addToLookup(movesByCompactKey, move?.identity?.displayName, move);
  addToLookup(movesByCompactKey, move?.identity?.pokeapiSlug, move);
  addToLookup(movesByCompactKey, move?.identity?.showdownKey, move);
  addToLookup(movesByCompactKey, move?.matchKey, move);
}

for (const ability of abilityRecords) {
  addToLookup(
    abilitiesByCompactKey,
    ability?.identity?.displayName,
    ability
  );

  addToLookup(
    abilitiesByCompactKey,
    ability?.identity?.pokeapiSlug,
    ability
  );

  addToLookup(
    abilitiesByCompactKey,
    ability?.identity?.showdownKey,
    ability
  );

  addToLookup(
    abilitiesByCompactKey,
    ability?.matchKey,
    ability
  );
}

for (const item of itemRecords) {
  addToLookup(itemsByCompactKey, item?.identity?.displayName, item);
  addToLookup(itemsByCompactKey, item?.identity?.pokeapiSlug, item);
  addToLookup(itemsByCompactKey, item?.identity?.showdownKey, item);
  addToLookup(itemsByCompactKey, item?.matchKey, item);
}

for (const type of typeRecords) {
  addToLookup(typesByCompactKey, type?.identity?.displayName, type);
  addToLookup(typesByCompactKey, type?.identity?.slug, type);
}

for (const learnset of learnsetRecords) {
  addToLookup(
    learnsetsByCompactPokemonKey,
    learnset?.identity?.showdownPokemonKey,
    learnset
  );

  addToLookup(
    learnsetsByCompactPokemonKey,
    learnset?.identity?.displayName,
    learnset
  );
}

function getBestExactRecord(map, query) {
  const candidates = map.get(normalizeCompactKey(query)) ?? [];

  return candidates[0] ?? null;
}

export function getPokemonByName(name) {
  return getBestExactRecord(pokemonByCompactKey, name);
}

export function getMoveByName(name) {
  return getBestExactRecord(movesByCompactKey, name);
}

export function getAbilityByName(name) {
  return getBestExactRecord(abilitiesByCompactKey, name);
}

export function getItemByName(name) {
  return getBestExactRecord(itemsByCompactKey, name);
}

export function getTypeByName(name) {
  return getBestExactRecord(typesByCompactKey, name);
}

export function getLearnsetByPokemonName(name) {
  return getBestExactRecord(learnsetsByCompactPokemonKey, name);
}

export function canPokemonLearnMove(pokemonName, moveName) {
  const learnset = getLearnsetByPokemonName(pokemonName);
  const move = getMoveByName(moveName);

  if (!learnset || !move) {
    return {
      canLearn: false,
      foundPokemonLearnset: Boolean(learnset),
      foundMove: Boolean(move),
      matchedMove: null,
      methods: [],
    };
  }

  const targetMoveKey = normalizeCompactKey(
    move?.identity?.showdownKey ??
      move?.identity?.displayName ??
      moveName
  );

  const matchedMove = learnset.moves.find((entry) => {
    return (
      normalizeCompactKey(entry.moveKey) === targetMoveKey ||
      normalizeCompactKey(entry.displayName) === targetMoveKey
    );
  });

  return {
    canLearn: Boolean(matchedMove),
    foundPokemonLearnset: true,
    foundMove: true,
    matchedMove: matchedMove ?? null,
    methods: matchedMove?.methods ?? [],
  };
}

function scoreLoreChunk(chunk, query) {
  const normalizedQuery = normalizeSearchText(query);
  const queryTokens = tokenize(query);

  if (!normalizedQuery || queryTokens.length === 0) {
    return 0;
  }

  const title = normalizeSearchText(chunk?.page?.title ?? "");
  const heading = normalizeSearchText(chunk?.section?.heading ?? "");
  const text = normalizeSearchText(chunk?.text ?? "");
  const searchText = normalizeSearchText(chunk?.searchText ?? "");

  let score = 0;

  if (title === normalizedQuery) score += 200;
  if (title.includes(normalizedQuery)) score += 100;

  if (heading === normalizedQuery) score += 70;
  if (heading.includes(normalizedQuery)) score += 35;

  if (searchText.includes(normalizedQuery)) score += 40;
  if (text.includes(normalizedQuery)) score += 20;

  for (const token of queryTokens) {
    if (title.includes(token)) score += 20;
    if (heading.includes(token)) score += 12;

    const textCount = Math.min(countOccurrences(text, token), 5);
    score += textCount * 2;
  }

  const matchedTokenCount = queryTokens.filter((token) =>
    searchText.includes(token)
  ).length;

  if (matchedTokenCount === queryTokens.length) {
    score += 25;
  }

  return score;
}

function searchLoreChunks(chunks, query, limit = 8) {
  return chunks
    .map((chunk) => ({
      score: scoreLoreChunk(chunk, query),
      chunk,
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => ({
      score: entry.score,
      ...entry.chunk,
    }));
}

export function searchAnimeLore(query, limit = 8) {
  return searchLoreChunks(animeLoreChunks, query, limit);
}

export function searchMangaLore(query, limit = 8) {
  return searchLoreChunks(mangaLoreChunks, query, limit);
}

export function searchCrossMediaLore(query, limitPerCanon = 5) {
  return {
    anime: searchAnimeLore(query, limitPerCanon),
    manga: searchMangaLore(query, limitPerCanon),
  };
}

export function getPokemonKnowledgeStats() {
  return {
    pokemonRecords: pokemonRecords.length,
    moveRecords: moveRecords.length,
    abilityRecords: abilityRecords.length,
    itemRecords: itemRecords.length,
    typeRecords: typeRecords.length,
    evolutionRecords: evolutionRecords.length,
    learnsetRecords: learnsetRecords.length,
    animeLoreChunks: animeLoreChunks.length,
    mangaLoreChunks: mangaLoreChunks.length,
    totalLoreChunks: animeLoreChunks.length + mangaLoreChunks.length,
  };
}
