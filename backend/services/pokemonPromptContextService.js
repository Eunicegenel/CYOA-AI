import {
  getPokemonByName,
  getMoveByName,
  getAbilityByName,
  getItemByName,
  canPokemonLearnMove,
  searchAnimeLore,
  searchMangaLore,
} from "./pokemonKnowledgeService.js";

const MAX_POKEMON_MATCHES = 4;
const MAX_MOVE_MATCHES = 4;
const MAX_ABILITY_MATCHES = 3;
const MAX_ITEM_MATCHES = 3;
const MAX_LORE_RESULTS_PER_CANON = 2;
const MAX_LORE_SNIPPET_LENGTH = 650;

const POKEMON_FRANCHISE_TRIGGER_PATTERNS = [
  /\bpok[eé]mon\b/i,
  /\bpok[eé]dex\b/i,
  /\bpok[eé]ball\b/i,
  /\btrainer\b/i,
  /\bgym leader\b/i,
  /\belite four\b/i,
  /\bchampion\b/i,
  /\bmega evolution\b/i,
  /\bdynamax\b/i,
  /\bgigantamax\b/i,
  /\bterastal(?:ize|ization)?\b/i,
  /\btera\b/i,
  /\bz[- ]?move\b/i,
  /\bteam rocket\b/i,
  /\bprofessor oak\b/i,
  /\bash ketchum\b/i,
  /\bpok[eé]mon adventures\b/i,
];

const LORE_TRIGGER_PATTERNS = [
  /\banime\b/i,
  /\bmanga\b/i,
  /\badventures\b/i,
  /\barc\b/i,
  /\bepisode\b/i,
  /\bmovie\b/i,
  /\bseries\b/i,
  /\bhorizons\b/i,
  /\bash\b/i,
  /\bketchum\b/i,
  /\bteam rocket\b/i,
  /\byellow arc\b/i,
  /\bred\b/i,
  /\bblue\b/i,
  /\bgreen\b/i,
];

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

function compactKey(value = "") {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

function truncate(text = "", maxLength = 650) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxLength).trim()}...`;
}

function getRecentConversationText(history = []) {
  return history
    .slice(-6)
    .map((entry) => entry?.content ?? "")
    .join("\n");
}

function generateCandidatePhrases(message = "") {
  const tokens = normalizeSearchText(message)
    .split(" ")
    .filter(Boolean);

  const phrases = new Set();

  for (let start = 0; start < tokens.length; start += 1) {
    for (let length = 1; length <= 4; length += 1) {
      const phraseTokens = tokens.slice(start, start + length);

      if (phraseTokens.length !== length) continue;

      phrases.add(phraseTokens.join(" "));
    }
  }

  return [...phrases];
}

function dedupeRecords(records = [], getKey) {
  const seen = new Set();
  const result = [];

  for (const record of records) {
    if (!record) continue;

    const key = getKey(record);

    if (!key || seen.has(key)) continue;

    seen.add(key);
    result.push(record);
  }

  return result;
}

function extractPokemonMatches(message = "") {
  const candidates = generateCandidatePhrases(message);

  const matches = candidates
    .map((candidate) => getPokemonByName(candidate))
    .filter(Boolean);

  return dedupeRecords(
    matches,
    (record) =>
      record?.identity?.showdownKey ??
      record?.identity?.pokeapiSlug ??
      record?.identity?.displayName
  ).slice(0, MAX_POKEMON_MATCHES);
}

function extractMoveMatches(message = "") {
  const candidates = generateCandidatePhrases(message);

  const matches = candidates
    .map((candidate) => getMoveByName(candidate))
    .filter(Boolean);

  return dedupeRecords(
    matches,
    (record) =>
      record?.identity?.showdownKey ??
      record?.identity?.pokeapiSlug ??
      record?.identity?.displayName
  ).slice(0, MAX_MOVE_MATCHES);
}

function extractAbilityMatches(message = "") {
  const candidates = generateCandidatePhrases(message);

  const matches = candidates
    .map((candidate) => getAbilityByName(candidate))
    .filter(Boolean);

  return dedupeRecords(
    matches,
    (record) =>
      record?.identity?.showdownKey ??
      record?.identity?.pokeapiSlug ??
      record?.identity?.displayName
  ).slice(0, MAX_ABILITY_MATCHES);
}

function extractItemMatches(message = "") {
  const candidates = generateCandidatePhrases(message);

  const matches = candidates
    .map((candidate) => getItemByName(candidate))
    .filter(Boolean);

  return dedupeRecords(
    matches,
    (record) =>
      record?.identity?.showdownKey ??
      record?.identity?.pokeapiSlug ??
      record?.identity?.displayName
  ).slice(0, MAX_ITEM_MATCHES);
}

function hasExplicitPokemonTrigger(text = "") {
  return POKEMON_FRANCHISE_TRIGGER_PATTERNS.some((pattern) =>
    pattern.test(text)
  );
}

function hasLoreTrigger(text = "") {
  return LORE_TRIGGER_PATTERNS.some((pattern) => pattern.test(text));
}

function formatPokemonRecord(record) {
  const name = record?.identity?.displayName ?? "Unknown Pokémon";
  const types = record?.aiReadySummary?.primaryTypes ?? [];
  const genus = record?.classification?.genus ?? null;
  const abilities = record?.aiReadySummary?.primaryAbilities ?? [];
  const flavorText =
    record?.aiReadySummary?.flavorTexts?.at(-1)?.text ?? null;

  const parts = [
    `${name}`,
    types.length > 0 ? `Types: ${types.join("/")}` : null,
    genus ? `Species: ${genus}` : null,
    abilities.length > 0 ? `Abilities: ${abilities.join(", ")}` : null,
    flavorText ? `Pokédex flavor: ${truncate(flavorText, 280)}` : null,
  ].filter(Boolean);

  return `- ${parts.join(". ")}.`;
}

function formatMoveRecord(record) {
  const name = record?.identity?.displayName ?? "Unknown Move";
  const type = record?.aiReadySummary?.primaryType ?? null;
  const category = record?.aiReadySummary?.primaryCategory ?? null;
  const power = record?.aiReadySummary?.primaryPower ?? null;
  const description = record?.aiReadySummary?.conciseDescription ?? null;

  const parts = [
    name,
    type ? `Type: ${type}` : null,
    category ? `Category: ${category}` : null,
    power !== null ? `Power: ${power}` : null,
    description ? truncate(description, 240) : null,
  ].filter(Boolean);

  return `- ${parts.join(". ")}.`;
}

function formatAbilityRecord(record) {
  const name = record?.identity?.displayName ?? "Unknown Ability";
  const description = record?.aiReadySummary?.conciseDescription ?? null;

  return `- ${name}${description ? `. ${truncate(description, 260)}` : ""}`;
}

function formatItemRecord(record) {
  const name = record?.identity?.displayName ?? "Unknown Item";
  const description = record?.aiReadySummary?.conciseDescription ?? null;

  return `- ${name}${description ? `. ${truncate(description, 260)}` : ""}`;
}

function formatLearnsetChecks(pokemonMatches = [], moveMatches = []) {
  if (pokemonMatches.length === 0 || moveMatches.length === 0) {
    return [];
  }

  const checks = [];

  for (const pokemon of pokemonMatches.slice(0, 2)) {
    const pokemonName = pokemon?.identity?.displayName;

    if (!pokemonName) continue;

    for (const move of moveMatches.slice(0, 3)) {
      const moveName = move?.identity?.displayName;

      if (!moveName) continue;

      const result = canPokemonLearnMove(pokemonName, moveName);

      checks.push(
        `- ${pokemonName} ${
          result.canLearn ? "can" : "is not currently listed as able to"
        } learn ${moveName} in the imported learnset data.`
      );
    }
  }

  return checks;
}

function formatLoreResults(label, results = []) {
  if (results.length === 0) return "";

  const lines = results.map((entry) => {
    const title = entry?.page?.title ?? "Untitled";
    const heading = entry?.section?.heading || "Lead";
    const text = truncate(entry?.text ?? "", MAX_LORE_SNIPPET_LENGTH);

    return `- ${title} | ${heading}: ${text}`;
  });

  return `${label}:\n${lines.join("\n")}`;
}

export function buildPokemonPromptContext({
  message = "",
  history = [],
  mode = "assistant",
} = {}) {
  const recentConversationText = getRecentConversationText(history);
  const combinedText = `${message}\n${recentConversationText}`;

  const pokemonMatches = extractPokemonMatches(message);
  const moveMatches = extractMoveMatches(message);
  const abilityMatches = extractAbilityMatches(message);
  const itemMatches = extractItemMatches(message);

  const explicitlyPokemon =
    hasExplicitPokemonTrigger(combinedText) ||
    pokemonMatches.length > 0;

  if (!explicitlyPokemon) {
    return "";
  }

  const loreRelevant =
    mode === "story" ||
    mode === "adultStory" ||
    hasLoreTrigger(combinedText);

  const animeLoreResults = loreRelevant
    ? searchAnimeLore(message, MAX_LORE_RESULTS_PER_CANON)
    : [];

  const mangaLoreResults = loreRelevant
    ? searchMangaLore(message, MAX_LORE_RESULTS_PER_CANON)
    : [];

  const pokemonLines = pokemonMatches.map(formatPokemonRecord);
  const moveLines = moveMatches.map(formatMoveRecord);
  const abilityLines = abilityMatches.map(formatAbilityRecord);
  const itemLines = itemMatches.map(formatItemRecord);
  const learnsetLines = formatLearnsetChecks(
    pokemonMatches,
    moveMatches
  );

  const sections = [];

  if (pokemonLines.length > 0) {
    sections.push(`Relevant Pokémon:\n${pokemonLines.join("\n")}`);
  }

  if (moveLines.length > 0) {
    sections.push(`Relevant moves:\n${moveLines.join("\n")}`);
  }

  if (abilityLines.length > 0) {
    sections.push(`Relevant abilities:\n${abilityLines.join("\n")}`);
  }

  if (itemLines.length > 0) {
    sections.push(`Relevant items:\n${itemLines.join("\n")}`);
  }

  if (learnsetLines.length > 0) {
    sections.push(`Learnset checks:\n${learnsetLines.join("\n")}`);
  }

  const animeLoreBlock = formatLoreResults("Anime lore snippets", animeLoreResults);
  const mangaLoreBlock = formatLoreResults("Manga lore snippets", mangaLoreResults);

  if (animeLoreBlock) {
    sections.push(animeLoreBlock);
  }

  if (mangaLoreBlock) {
    sections.push(mangaLoreBlock);
  }

  if (sections.length === 0) {
    return "";
  }

  return `
POKÉMON KNOWLEDGE CONTEXT:
Use this local reference only when relevant to the user's request or ongoing scene.
Do not mention that this context was retrieved.
Do not silently merge game canon, anime canon, and manga canon when they conflict.
For factual answers, distinguish canons when useful.
For story replies, use only the imported material that fits the scene and the ongoing campaign tone.

${sections.join("\n\n")}
  `.trim();
}
