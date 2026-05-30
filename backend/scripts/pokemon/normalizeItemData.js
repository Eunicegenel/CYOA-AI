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

const OUTPUT_FILE = path.join(NORMALIZED_ROOT, "items.json");

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

function extractEnglishNames(item) {
  return (
    item?.names
      ?.filter((entry) => entry?.language?.name === "en")
      .map((entry) => entry?.name)
      .filter(Boolean) ?? []
  );
}

function extractEnglishFlavorTexts(item) {
  const entries = item?.flavor_text_entries ?? [];
  const result = [];
  const seen = new Set();

  for (const entry of entries) {
    if (entry?.language?.name !== "en") continue;

    const text = String(entry?.text ?? entry?.flavor_text ?? "")
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

function extractEnglishEffectEntries(item) {
  const entries = item?.effect_entries ?? [];

  return entries
    .filter((entry) => entry?.language?.name === "en")
    .map((entry) => ({
      shortEffect: entry?.short_effect ?? null,
      effect: entry?.effect ?? null,
    }));
}

function normalizeHeldByPokemon(item) {
  return (item?.held_by_pokemon ?? []).map((entry) => ({
    pokemonSlug: entry?.pokemon?.name ?? null,
    pokemonId: parseResourceIdFromUrl(entry?.pokemon?.url),
    versionDetails:
      entry?.version_details?.map((detail) => ({
        rarity: detail?.rarity ?? null,
        version: detail?.version?.name ?? null,
      })) ?? [],
  }));
}

function normalizeAttributes(item) {
  return (item?.attributes ?? []).map((attribute) => ({
    slug: attribute?.name ?? null,
  }));
}

function normalizeGameIndices(item) {
  return (item?.game_indices ?? []).map((entry) => ({
    gameIndex: entry?.game_index ?? null,
    generation: entry?.generation?.name ?? null,
  }));
}

function buildPokeApiItemMap(items) {
  const map = new Map();

  for (const item of items) {
    const matchKey = toId(item?.name);

    if (!matchKey) continue;
    map.set(matchKey, item);
  }

  return map;
}

function buildShowdownItemMap(showdownItems) {
  const map = new Map();

  for (const [showdownKey, item] of Object.entries(showdownItems)) {
    const matchKey = toId(showdownKey || item?.name);

    if (!matchKey) continue;

    map.set(matchKey, {
      showdownKey,
      ...item,
    });
  }

  return map;
}

function normalizeShowdownItemBattleData(showdownItem) {
  if (!showdownItem) return null;

  const {
    showdownKey,
    name,
    num,
    gen,
    fling,
    spritenum,
    isBerry,
    isChoice,
    megaStone,
    megaEvolves,
    itemUser,
    zMove,
    zMoveType,
    zMoveFrom,
    onPlate,
    onMemory,
    onDrive,
    forcedForme,
    desc,
    shortDesc,
    isNonstandard,
    ...remainingBattleLogic
  } = showdownItem;

  return {
    num: num ?? null,
    name: name ?? null,
    gen: gen ?? null,
    fling: fling ?? null,
    spriteNumber: spritenum ?? null,

    isBerry: isBerry ?? null,
    isChoice: isChoice ?? null,

    megaStone: megaStone ?? null,
    megaEvolves: megaEvolves ?? null,
    itemUser: itemUser ?? [],

    zMove: zMove ?? null,
    zMoveType: zMoveType ?? null,
    zMoveFrom: zMoveFrom ?? null,

    plateType: onPlate ?? null,
    memoryType: onMemory ?? null,
    driveType: onDrive ?? null,
    forcedForme: forcedForme ?? null,

    shortDesc: shortDesc ?? null,
    desc: desc ?? null,
    isNonstandard: isNonstandard ?? null,

    // Preserve simulator hooks/effects instead of dropping them.
    mechanics: remainingBattleLogic,
  };
}

function buildNormalizedItemRecord({
  matchKey,
  pokeapiItem = null,
  showdownItem = null,
}) {
  const effectEntries = extractEnglishEffectEntries(pokeapiItem);

  const displayName =
    showdownItem?.name ??
    extractEnglishNames(pokeapiItem)?.[0] ??
    titleCaseFromSlug(pokeapiItem?.name ?? matchKey);

  return {
    matchKey,

    identity: {
      displayName,
      pokeapiSlug: pokeapiItem?.name ?? null,
      pokeapiItemId: pokeapiItem?.id ?? null,
      showdownKey: showdownItem?.showdownKey ?? null,
    },

    gameData: pokeapiItem
      ? {
          cost: pokeapiItem.cost ?? null,
          flingPower: pokeapiItem.fling_power ?? null,
          flingEffect: pokeapiItem.fling_effect?.name ?? null,

          category: pokeapiItem.category?.name ?? null,
          pocket: pokeapiItem.category?.pocket?.name ?? null,

          attributes: normalizeAttributes(pokeapiItem),
          gameIndices: normalizeGameIndices(pokeapiItem),
          heldByPokemon: normalizeHeldByPokemon(pokeapiItem),

          englishNames: extractEnglishNames(pokeapiItem),
          effectEntries,
          flavorTexts: extractEnglishFlavorTexts(pokeapiItem),
        }
      : null,

    battleData: normalizeShowdownItemBattleData(showdownItem),

    aiReadySummary: {
      conciseDescription:
        showdownItem?.shortDesc ??
        effectEntries?.[0]?.shortEffect ??
        null,

      detailedDescription:
        showdownItem?.desc ??
        effectEntries?.[0]?.effect ??
        null,

      category:
        pokeapiItem?.category?.name ??
        null,

      pocket:
        pokeapiItem?.category?.pocket?.name ??
        null,

      isBattleRelevant: Boolean(showdownItem),
      isNonstandard: showdownItem?.isNonstandard ?? null,
    },

    sourceCoverage: {
      hasPokeApiItem: Boolean(pokeapiItem),
      hasShowdownItem: Boolean(showdownItem),
    },
  };
}

function main() {
  ensureOutputFolder();

  console.log("Loading PokéAPI items...");
  const pokeapiItems = readPokeApiResourceCollection("item");

  console.log("Loading Pokémon Showdown items...");
  const showdownItems = loadShowdownDataTable(
    path.join(SHOWDOWN_ROOT, "items.js"),
    ["BattleItems", "Items"]
  );

  const pokeapiItemMap = buildPokeApiItemMap(pokeapiItems);
  const showdownItemMap = buildShowdownItemMap(showdownItems);

  const allMatchKeys = new Set([
    ...pokeapiItemMap.keys(),
    ...showdownItemMap.keys(),
  ]);

  const normalizedItems = [];

  let matchedBoth = 0;
  let pokeapiOnly = 0;
  let showdownOnly = 0;

  console.log(`Normalizing ${allMatchKeys.size} unified item keys...`);

  for (const matchKey of allMatchKeys) {
    const pokeapiItem = pokeapiItemMap.get(matchKey) ?? null;
    const showdownItem = showdownItemMap.get(matchKey) ?? null;

    if (pokeapiItem && showdownItem) matchedBoth += 1;
    else if (pokeapiItem) pokeapiOnly += 1;
    else if (showdownItem) showdownOnly += 1;

    normalizedItems.push(
      buildNormalizedItemRecord({
        matchKey,
        pokeapiItem,
        showdownItem,
      })
    );
  }

  normalizedItems.sort((a, b) =>
    a.identity.displayName.localeCompare(b.identity.displayName)
  );

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(normalizedItems, null, 2),
    "utf8"
  );

  console.log("\nItem normalization complete.");
  console.log(`Saved to: ${OUTPUT_FILE}`);
  console.log(`Total normalized records: ${normalizedItems.length}`);
  console.log(`Matched PokéAPI + Showdown: ${matchedBoth}`);
  console.log(`PokéAPI-only records: ${pokeapiOnly}`);
  console.log(`Showdown-only records: ${showdownOnly}`);
}

main();
