import fs from "fs";
import path from "path";
import vm from "vm";
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

const OUTPUT_FILE = path.join(NORMALIZED_ROOT, "abilities.json");

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

function parseResourceIdFromUrl(url = "") {
  const match = String(url).match(/\/(\d+)\/?$/);
  return match ? Number(match[1]) : null;
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

function loadShowdownDataTable(jsFilePath, preferredKeys = []) {
  const code = fs.readFileSync(jsFilePath, "utf8");

  const sandbox = {
    exports: {},
    module: { exports: {} },
    window: {},
    global: {},
    console: {
      log: () => {},
      warn: () => {},
      error: () => {},
    },
  };

  sandbox.global = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, {
    filename: path.basename(jsFilePath),
    timeout: 10000,
  });

  const candidates = [
    ...preferredKeys.map((key) => sandbox[key]),
    ...preferredKeys.map((key) => sandbox.exports?.[key]),
    ...preferredKeys.map((key) => sandbox.module?.exports?.[key]),
    ...preferredKeys.map((key) => sandbox.window?.[key]),
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") {
      return candidate;
    }
  }

  throw new Error(
    `Could not find expected Showdown data table in ${jsFilePath}`
  );
}

function extractEnglishNames(ability) {
  return (
    ability?.names
      ?.filter((entry) => entry?.language?.name === "en")
      .map((entry) => entry?.name)
      .filter(Boolean) ?? []
  );
}

function extractEnglishFlavorTexts(ability) {
  const entries = ability?.flavor_text_entries ?? [];
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

function extractEnglishEffectEntries(ability) {
  const entries = ability?.effect_entries ?? [];

  return entries
    .filter((entry) => entry?.language?.name === "en")
    .map((entry) => ({
      shortEffect: entry?.short_effect ?? null,
      effect: entry?.effect ?? null,
    }));
}

function normalizeAbilityPokemonList(ability) {
  return (ability?.pokemon ?? []).map((entry) => ({
    pokemonSlug: entry?.pokemon?.name ?? null,
    pokemonId: parseResourceIdFromUrl(entry?.pokemon?.url),
    isHidden: Boolean(entry?.is_hidden),
    slot: entry?.slot ?? null,
  }));
}

function buildPokeApiAbilityMap(abilities) {
  const map = new Map();

  for (const ability of abilities) {
    const matchKey = toId(ability?.name);

    if (!matchKey) continue;
    map.set(matchKey, ability);
  }

  return map;
}

function buildShowdownAbilityMap(showdownAbilities) {
  const map = new Map();

  for (const [showdownKey, ability] of Object.entries(showdownAbilities)) {
    const matchKey = toId(showdownKey || ability?.name);

    if (!matchKey) continue;

    map.set(matchKey, {
      showdownKey,
      ...ability,
    });
  }

  return map;
}

function normalizeShowdownAbilityBattleData(showdownAbility) {
  if (!showdownAbility) return null;

  const {
    showdownKey,
    name,
    num,
    rating,
    flags,
    isNonstandard,
    shortDesc,
    desc,
    ...remainingBattleLogic
  } = showdownAbility;

  return {
    num: num ?? null,
    name: name ?? null,
    rating: rating ?? null,
    flags: flags ?? {},
    isNonstandard: isNonstandard ?? null,
    shortDesc: shortDesc ?? null,
    desc: desc ?? null,

    // Preserve all simulator-specific hooks/mechanics without trying
    // to flatten them incorrectly.
    mechanics: remainingBattleLogic,
  };
}

function buildNormalizedAbilityRecord({
  matchKey,
  pokeapiAbility = null,
  showdownAbility = null,
}) {
  const displayName =
    showdownAbility?.name ??
    extractEnglishNames(pokeapiAbility)?.[0] ??
    titleCaseFromSlug(pokeapiAbility?.name ?? matchKey);

  const effectEntries = extractEnglishEffectEntries(pokeapiAbility);

  return {
    matchKey,

    identity: {
      displayName,
      pokeapiSlug: pokeapiAbility?.name ?? null,
      pokeapiAbilityId: pokeapiAbility?.id ?? null,
      showdownKey: showdownAbility?.showdownKey ?? null,
    },

    gameData: pokeapiAbility
      ? {
          isMainSeries: pokeapiAbility.is_main_series ?? null,
          generation: pokeapiAbility.generation?.name ?? null,
          englishNames: extractEnglishNames(pokeapiAbility),
          effectEntries,
          flavorTexts: extractEnglishFlavorTexts(pokeapiAbility),
          pokemon: normalizeAbilityPokemonList(pokeapiAbility),
        }
      : null,

    battleData: normalizeShowdownAbilityBattleData(showdownAbility),

    aiReadySummary: {
      conciseDescription:
        showdownAbility?.shortDesc ??
        effectEntries?.[0]?.shortEffect ??
        null,

      detailedDescription:
        showdownAbility?.desc ??
        effectEntries?.[0]?.effect ??
        null,

      isNonstandard: showdownAbility?.isNonstandard ?? null,
    },

    sourceCoverage: {
      hasPokeApiAbility: Boolean(pokeapiAbility),
      hasShowdownAbility: Boolean(showdownAbility),
    },
  };
}

function main() {
  ensureOutputFolder();

  console.log("Loading PokéAPI abilities...");
  const pokeapiAbilities = readPokeApiResourceCollection("ability");

  console.log("Loading Pokémon Showdown abilities...");
  const showdownAbilities = loadShowdownDataTable(
    path.join(SHOWDOWN_ROOT, "abilities.js"),
    ["BattleAbilities", "Abilities"]
  );

  const pokeapiAbilityMap = buildPokeApiAbilityMap(pokeapiAbilities);
  const showdownAbilityMap = buildShowdownAbilityMap(showdownAbilities);

  const allMatchKeys = new Set([
    ...pokeapiAbilityMap.keys(),
    ...showdownAbilityMap.keys(),
  ]);

  const normalizedAbilities = [];

  let matchedBoth = 0;
  let pokeapiOnly = 0;
  let showdownOnly = 0;

  console.log(`Normalizing ${allMatchKeys.size} unified ability keys...`);

  for (const matchKey of allMatchKeys) {
    const pokeapiAbility = pokeapiAbilityMap.get(matchKey) ?? null;
    const showdownAbility = showdownAbilityMap.get(matchKey) ?? null;

    if (pokeapiAbility && showdownAbility) matchedBoth += 1;
    else if (pokeapiAbility) pokeapiOnly += 1;
    else if (showdownAbility) showdownOnly += 1;

    normalizedAbilities.push(
      buildNormalizedAbilityRecord({
        matchKey,
        pokeapiAbility,
        showdownAbility,
      })
    );
  }

  normalizedAbilities.sort((a, b) =>
    a.identity.displayName.localeCompare(b.identity.displayName)
  );

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(normalizedAbilities, null, 2),
    "utf8"
  );

  console.log("\nAbility normalization complete.");
  console.log(`Saved to: ${OUTPUT_FILE}`);
  console.log(`Total normalized records: ${normalizedAbilities.length}`);
  console.log(`Matched PokéAPI + Showdown: ${matchedBoth}`);
  console.log(`PokéAPI-only records: ${pokeapiOnly}`);
  console.log(`Showdown-only records: ${showdownOnly}`);
}

main();
