import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RAW_ROOT = path.join(__dirname, "../../data/pokemon/raw");
const NORMALIZED_ROOT = path.join(
  __dirname,
  "../../data/pokemon/normalized"
);

const POKEAPI_V2_ROOT = path.join(
  RAW_ROOT,
  "pokeapi/data/api/v2"
);

const SHOWDOWN_ROOT = path.join(RAW_ROOT, "showdown");

const OUTPUT_FILE = path.join(NORMALIZED_ROOT, "moves.json");

function ensureOutputFolder() {
  fs.mkdirSync(NORMALIZED_ROOT, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function safeReadJson(filePath) {
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

function toId(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function titleCaseFromSlug(value = "") {
  return String(value)
    .split("-")
    .map((part) =>
      part ? part.charAt(0).toUpperCase() + part.slice(1) : part
    )
    .join(" ");
}

function readPokeApiResourceCollection(resourceFolderName) {
  const resourceRoot = path.join(POKEAPI_V2_ROOT, resourceFolderName);

  if (!fs.existsSync(resourceRoot)) {
    console.warn(`Missing PokéAPI folder: ${resourceFolderName}`);
    return [];
  }

  return fs
    .readdirSync(resourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const filePath = path.join(resourceRoot, entry.name, "index.json");
      return safeReadJson(filePath);
    })
    .filter(Boolean);
}

function extractEnglishFlavorTexts(move) {
  const entries = move?.flavor_text_entries ?? [];
  const result = [];
  const seen = new Set();

  for (const entry of entries) {
    if (entry?.language?.name !== "en") continue;

    const text = String(entry?.flavor_text ?? "")
      .replace(/\f/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) continue;

    const key = `${entry?.version_group?.name ?? "unknown"}::${text}`;

    if (seen.has(key)) continue;
    seen.add(key);

    result.push({
      versionGroup: entry?.version_group?.name ?? null,
      language: "en",
      text,
    });
  }

  return result;
}

function extractEnglishEffectEntries(move) {
  const entries = move?.effect_entries ?? [];

  return entries
    .filter((entry) => entry?.language?.name === "en")
    .map((entry) => ({
      shortEffect: entry?.short_effect ?? null,
      effect: entry?.effect ?? null,
    }));
}

function buildPokeApiMoveMap(moveList) {
  const map = new Map();

  for (const move of moveList) {
    const matchKey = toId(move?.name);

    if (!matchKey) continue;
    map.set(matchKey, move);
  }

  return map;
}

function buildShowdownMoveMap(showdownMoves) {
  const map = new Map();

  for (const [showdownKey, move] of Object.entries(showdownMoves)) {
    const matchKey = toId(showdownKey || move?.name);

    if (!matchKey) continue;

    map.set(matchKey, {
      showdownKey,
      ...move,
    });
  }

  return map;
}

function normalizePokeApiPastValues(pastValues = []) {
  return pastValues.map((entry) => ({
    accuracy: entry?.accuracy ?? null,
    effectChance: entry?.effect_chance ?? null,
    power: entry?.power ?? null,
    pp: entry?.pp ?? null,
    type: entry?.type?.name ?? null,
    versionGroup: entry?.version_group?.name ?? null,
  }));
}

function buildNormalizedMoveRecord({
  matchKey,
  pokeapiMove = null,
  showdownMove = null,
}) {
  const displayName =
    showdownMove?.name ??
    titleCaseFromSlug(pokeapiMove?.name ?? matchKey);

  return {
    matchKey,

    identity: {
      displayName,
      pokeapiSlug: pokeapiMove?.name ?? null,
      pokeapiMoveId: pokeapiMove?.id ?? null,
      showdownKey: showdownMove?.showdownKey ?? null,
    },

    gameData: pokeapiMove
      ? {
          accuracy: pokeapiMove.accuracy ?? null,
          effectChance: pokeapiMove.effect_chance ?? null,
          pp: pokeapiMove.pp ?? null,
          priority: pokeapiMove.priority ?? null,
          power: pokeapiMove.power ?? null,

          type: pokeapiMove.type?.name ?? null,
          damageClass: pokeapiMove.damage_class?.name ?? null,
          generation: pokeapiMove.generation?.name ?? null,
          target: pokeapiMove.target?.name ?? null,

          ailment: pokeapiMove.meta?.ailment?.name ?? null,
          ailmentChance: pokeapiMove.meta?.ailment_chance ?? null,
          category: pokeapiMove.meta?.category?.name ?? null,
          critRate: pokeapiMove.meta?.crit_rate ?? null,
          drain: pokeapiMove.meta?.drain ?? null,
          flinchChance: pokeapiMove.meta?.flinch_chance ?? null,
          healing: pokeapiMove.meta?.healing ?? null,
          maxHits: pokeapiMove.meta?.max_hits ?? null,
          maxTurns: pokeapiMove.meta?.max_turns ?? null,
          minHits: pokeapiMove.meta?.min_hits ?? null,
          minTurns: pokeapiMove.meta?.min_turns ?? null,
          statChance: pokeapiMove.meta?.stat_chance ?? null,

          statChanges:
            pokeapiMove.stat_changes?.map((entry) => ({
              stat: entry?.stat?.name ?? null,
              change: entry?.change ?? null,
            })) ?? [],

          effectEntries: extractEnglishEffectEntries(pokeapiMove),
          flavorTexts: extractEnglishFlavorTexts(pokeapiMove),
          pastValues: normalizePokeApiPastValues(
            pokeapiMove.past_values
          ),
        }
      : null,

    battleData: showdownMove
      ? {
          num: showdownMove.num ?? null,
          basePower: showdownMove.basePower ?? null,
          accuracy: showdownMove.accuracy ?? null,
          pp: showdownMove.pp ?? null,
          category: showdownMove.category ?? null,
          type: showdownMove.type ?? null,
          priority: showdownMove.priority ?? null,
          target: showdownMove.target ?? null,

          contestType: showdownMove.contestType ?? null,
          flags: showdownMove.flags ?? {},
          secondary: showdownMove.secondary ?? null,
          secondaries: showdownMove.secondaries ?? null,
          self: showdownMove.self ?? null,
          selfBoost: showdownMove.selfBoost ?? null,
          boosts: showdownMove.boosts ?? null,
          status: showdownMove.status ?? null,
          volatileStatus: showdownMove.volatileStatus ?? null,
          sideCondition: showdownMove.sideCondition ?? null,
          slotCondition: showdownMove.slotCondition ?? null,
          weather: showdownMove.weather ?? null,
          terrain: showdownMove.terrain ?? null,
          forceSwitch: showdownMove.forceSwitch ?? null,
          selfSwitch: showdownMove.selfSwitch ?? null,
          healing: showdownMove.heal ?? null,
          drain: showdownMove.drain ?? null,
          recoil: showdownMove.recoil ?? null,
          multihit: showdownMove.multihit ?? null,
          critRatio: showdownMove.critRatio ?? null,
          ignoreImmunity: showdownMove.ignoreImmunity ?? null,
          ignoreAbility: showdownMove.ignoreAbility ?? null,
          breaksProtect: showdownMove.breaksProtect ?? null,
          willCrit: showdownMove.willCrit ?? null,
          noPPBoosts: showdownMove.noPPBoosts ?? null,
          isZ: showdownMove.isZ ?? null,
          isMax: showdownMove.isMax ?? null,
          isNonstandard: showdownMove.isNonstandard ?? null,
          shortDesc: showdownMove.shortDesc ?? null,
          desc: showdownMove.desc ?? null,
        }
      : null,

    aiReadySummary: {
      primaryType:
        showdownMove?.type ??
        pokeapiMove?.type?.name ??
        null,

      primaryCategory:
        showdownMove?.category ??
        pokeapiMove?.damage_class?.name ??
        null,

      primaryPower:
        showdownMove?.basePower ??
        pokeapiMove?.power ??
        null,

      primaryAccuracy:
        showdownMove?.accuracy ??
        pokeapiMove?.accuracy ??
        null,

      primaryPP:
        showdownMove?.pp ??
        pokeapiMove?.pp ??
        null,

      conciseDescription:
        showdownMove?.shortDesc ??
        extractEnglishEffectEntries(pokeapiMove)?.[0]?.shortEffect ??
        null,
    },

    sourceCoverage: {
      hasPokeApiMove: Boolean(pokeapiMove),
      hasShowdownMove: Boolean(showdownMove),
    },
  };
}

function main() {
  ensureOutputFolder();

  console.log("Loading PokéAPI moves...");
  const pokeapiMoves = readPokeApiResourceCollection("move");

  console.log("Loading Pokémon Showdown moves...");
  const showdownMoves = readJson(
    path.join(SHOWDOWN_ROOT, "moves.json")
  );

  const pokeapiMoveMap = buildPokeApiMoveMap(pokeapiMoves);
  const showdownMoveMap = buildShowdownMoveMap(showdownMoves);

  const allMatchKeys = new Set([
    ...pokeapiMoveMap.keys(),
    ...showdownMoveMap.keys(),
  ]);

  const normalizedMoves = [];

  let matchedBoth = 0;
  let pokeapiOnly = 0;
  let showdownOnly = 0;

  console.log(`Normalizing ${allMatchKeys.size} unified move keys...`);

  for (const matchKey of allMatchKeys) {
    const pokeapiMove = pokeapiMoveMap.get(matchKey) ?? null;
    const showdownMove = showdownMoveMap.get(matchKey) ?? null;

    if (pokeapiMove && showdownMove) matchedBoth += 1;
    else if (pokeapiMove) pokeapiOnly += 1;
    else if (showdownMove) showdownOnly += 1;

    normalizedMoves.push(
      buildNormalizedMoveRecord({
        matchKey,
        pokeapiMove,
        showdownMove,
      })
    );
  }

  normalizedMoves.sort((a, b) =>
    a.identity.displayName.localeCompare(b.identity.displayName)
  );

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(normalizedMoves, null, 2),
    "utf8"
  );

  console.log("\nMove normalization complete.");
  console.log(`Saved to: ${OUTPUT_FILE}`);
  console.log(`Total normalized records: ${normalizedMoves.length}`);
  console.log(`Matched PokéAPI + Showdown: ${matchedBoth}`);
  console.log(`PokéAPI-only records: ${pokeapiOnly}`);
  console.log(`Showdown-only records: ${showdownOnly}`);
}

main();
