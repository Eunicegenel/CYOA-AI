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

const OUTPUT_FILE = path.join(NORMALIZED_ROOT, "pokemon.json");

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

function normalizePokeApiStats(stats = []) {
  const result = {};

  for (const statEntry of stats) {
    const statName = statEntry?.stat?.name;
    const value = statEntry?.base_stat ?? null;

    switch (statName) {
      case "hp":
        result.hp = value;
        break;
      case "attack":
        result.atk = value;
        break;
      case "defense":
        result.def = value;
        break;
      case "special-attack":
        result.spa = value;
        break;
      case "special-defense":
        result.spd = value;
        break;
      case "speed":
        result.spe = value;
        break;
      default:
        break;
    }
  }

  return result;
}

function normalizePokeApiTypes(types = []) {
  return [...types]
    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
    .map((entry) => titleCaseFromSlug(entry?.type?.name))
    .filter(Boolean);
}

function normalizePokeApiAbilities(abilities = []) {
  return abilities
    .map((entry) => ({
      name: titleCaseFromSlug(entry?.ability?.name),
      slug: entry?.ability?.name ?? null,
      isHidden: Boolean(entry?.is_hidden),
      slot: entry?.slot ?? null,
    }))
    .filter((entry) => entry.slug);
}

function normalizeShowdownAbilities(abilities = {}) {
  return Object.entries(abilities).map(([slot, name]) => ({
    slot,
    name,
  }));
}

function extractEnglishGenus(species) {
  return (
    species?.genera?.find((entry) => entry?.language?.name === "en")
      ?.genus ?? null
  );
}

function extractEnglishFlavorTexts(species) {
  const flavorTexts = species?.flavor_text_entries ?? [];
  const seen = new Set();
  const result = [];

  for (const entry of flavorTexts) {
    if (entry?.language?.name !== "en") continue;

    const cleanedText = String(entry?.flavor_text ?? "")
      .replace(/\f/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanedText) continue;

    const dedupeKey = `${entry?.version?.name ?? "unknown"}::${cleanedText}`;

    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    result.push({
      version: entry?.version?.name ?? null,
      language: "en",
      text: cleanedText,
    });
  }

  return result;
}

function normalizeVarieties(species) {
  return (species?.varieties ?? []).map((entry) => ({
    isDefault: Boolean(entry?.is_default),
    pokemonSlug: entry?.pokemon?.name ?? null,
    pokemonId: parseResourceIdFromUrl(entry?.pokemon?.url),
  }));
}

function buildSpeciesMaps(speciesList) {
  const bySlug = new Map();
  const byId = new Map();

  for (const species of speciesList) {
    if (species?.name) bySlug.set(species.name, species);
    if (species?.id) byId.set(species.id, species);
  }

  return { bySlug, byId };
}

function buildPokeApiPokemonMap(pokemonList) {
  const byMatchKey = new Map();

  for (const pokemon of pokemonList) {
    const matchKey = toId(pokemon?.name);

    if (!matchKey) continue;

    byMatchKey.set(matchKey, pokemon);
  }

  return byMatchKey;
}

function buildShowdownPokedexMap(showdownPokedex) {
  const byMatchKey = new Map();

  for (const [showdownKey, entry] of Object.entries(showdownPokedex)) {
    const matchKey = toId(showdownKey || entry?.name);

    if (!matchKey) continue;

    byMatchKey.set(matchKey, {
      showdownKey,
      ...entry,
    });
  }

  return byMatchKey;
}

function buildNormalizedPokemonRecord({
  matchKey,
  pokeapiPokemon = null,
  pokeapiSpecies = null,
  showdownEntry = null,
}) {
  const preferredName =
    showdownEntry?.name ??
    pokeapiPokemon?.name ??
    pokeapiSpecies?.name ??
    matchKey;

  const pokeapiTypes = normalizePokeApiTypes(pokeapiPokemon?.types);
  const showdownTypes = showdownEntry?.types ?? [];

  const pokeapiBaseStats = normalizePokeApiStats(pokeapiPokemon?.stats);
  const showdownBaseStats = showdownEntry?.baseStats ?? null;

  const pokeapiAbilityNames = normalizePokeApiAbilities(
    pokeapiPokemon?.abilities
  ).map((entry) => entry.name);

  const showdownAbilityNames = normalizeShowdownAbilities(
    showdownEntry?.abilities
  ).map((entry) => entry.name);

  const mergedAbilityNames = [
    ...new Set([...showdownAbilityNames, ...pokeapiAbilityNames].filter(Boolean)),
  ];

  return {
    matchKey,

    identity: {
      displayName:
        showdownEntry?.name ??
        titleCaseFromSlug(pokeapiPokemon?.name ?? preferredName),
      pokeapiSlug: pokeapiPokemon?.name ?? null,
      speciesSlug: pokeapiSpecies?.name ?? pokeapiPokemon?.species?.name ?? null,
      showdownKey: showdownEntry?.showdownKey ?? null,
      nationalDexNumber:
        showdownEntry?.num && showdownEntry.num > 0
          ? showdownEntry.num
          : pokeapiSpecies?.id ?? null,
      pokeapiPokemonId: pokeapiPokemon?.id ?? null,
      pokeapiSpeciesId: pokeapiSpecies?.id ?? null,
    },

    classification: {
      genus: extractEnglishGenus(pokeapiSpecies),
      color: pokeapiSpecies?.color?.name ?? null,
      shape: pokeapiSpecies?.shape?.name ?? null,
      habitat: pokeapiSpecies?.habitat?.name ?? null,
      isBaby: pokeapiSpecies?.is_baby ?? null,
      isLegendary: pokeapiSpecies?.is_legendary ?? null,
      isMythical: pokeapiSpecies?.is_mythical ?? null,
    },

    gameData: {
      heightDecimeters: pokeapiPokemon?.height ?? null,
      weightHectograms: pokeapiPokemon?.weight ?? null,
      baseExperience: pokeapiPokemon?.base_experience ?? null,
      order: pokeapiPokemon?.order ?? null,
      isDefaultPokemonEntry: pokeapiPokemon?.is_default ?? null,

      species: {
        captureRate: pokeapiSpecies?.capture_rate ?? null,
        baseHappiness: pokeapiSpecies?.base_happiness ?? null,
        genderRate: pokeapiSpecies?.gender_rate ?? null,
        hatchCounter: pokeapiSpecies?.hatch_counter ?? null,
        growthRate: pokeapiSpecies?.growth_rate?.name ?? null,
        evolvesFromSpecies:
          pokeapiSpecies?.evolves_from_species?.name ?? null,
        evolutionChainId: parseResourceIdFromUrl(
          pokeapiSpecies?.evolution_chain?.url
        ),
        generation: pokeapiSpecies?.generation?.name ?? null,
        varieties: normalizeVarieties(pokeapiSpecies),
      },

      types: pokeapiTypes,
      baseStats: pokeapiBaseStats,
      abilities: normalizePokeApiAbilities(pokeapiPokemon?.abilities),
      forms:
        pokeapiPokemon?.forms?.map((entry) => ({
          slug: entry?.name ?? null,
          id: parseResourceIdFromUrl(entry?.url),
        })) ?? [],
    },

    battleData: showdownEntry
      ? {
          num: showdownEntry.num ?? null,
          gen: showdownEntry.gen ?? null,
          types: showdownTypes,
          baseStats: showdownBaseStats,
          abilities: normalizeShowdownAbilities(showdownEntry.abilities),
          heightMeters: showdownEntry.heightm ?? null,
          weightKilograms: showdownEntry.weightkg ?? null,
          color: showdownEntry.color ?? null,
          genderRatio: showdownEntry.genderRatio ?? null,
          gender: showdownEntry.gender ?? null,
          eggGroups: showdownEntry.eggGroups ?? [],
          tier: showdownEntry.tier ?? null,
          doublesTier: showdownEntry.doublesTier ?? null,
          natDexTier: showdownEntry.natDexTier ?? null,
          prevo: showdownEntry.prevo ?? null,
          evos: showdownEntry.evos ?? [],
          baseSpecies: showdownEntry.baseSpecies ?? null,
          forme: showdownEntry.forme ?? null,
          formeLetter: showdownEntry.formeLetter ?? null,
          otherFormes: showdownEntry.otherFormes ?? [],
          cosmeticFormes: showdownEntry.cosmeticFormes ?? [],
          tags: showdownEntry.tags ?? [],
        }
      : null,

    aiReadySummary: {
      primaryTypes:
        showdownTypes.length > 0 ? showdownTypes : pokeapiTypes,
      primaryBaseStats:
        showdownBaseStats && Object.keys(showdownBaseStats).length > 0
          ? showdownBaseStats
          : pokeapiBaseStats,
      primaryAbilities: mergedAbilityNames,
      flavorTexts: extractEnglishFlavorTexts(pokeapiSpecies),
    },

    sourceCoverage: {
      hasPokeApiPokemon: Boolean(pokeapiPokemon),
      hasPokeApiSpecies: Boolean(pokeapiSpecies),
      hasShowdownEntry: Boolean(showdownEntry),
    },
  };
}

function main() {
  ensureOutputFolder();

  console.log("Loading PokéAPI Pokémon...");
  const pokeapiPokemonList = readPokeApiResourceCollection("pokemon");

  console.log("Loading PokéAPI species...");
  const pokeapiSpeciesList = readPokeApiResourceCollection("pokemon-species");

  console.log("Loading Pokémon Showdown Pokédex...");
  const showdownPokedex = readJson(
    path.join(SHOWDOWN_ROOT, "pokedex.json")
  );

  const { bySlug: speciesBySlug } = buildSpeciesMaps(pokeapiSpeciesList);
  const pokeapiPokemonByMatchKey =
    buildPokeApiPokemonMap(pokeapiPokemonList);
  const showdownByMatchKey =
    buildShowdownPokedexMap(showdownPokedex);

  const allMatchKeys = new Set([
    ...pokeapiPokemonByMatchKey.keys(),
    ...showdownByMatchKey.keys(),
  ]);

  const normalizedPokemon = [];

  let matchedBoth = 0;
  let pokeapiOnly = 0;
  let showdownOnly = 0;

  console.log(`Normalizing ${allMatchKeys.size} unified Pokémon keys...`);

  for (const matchKey of allMatchKeys) {
    const pokeapiPokemon =
      pokeapiPokemonByMatchKey.get(matchKey) ?? null;

    const showdownEntry =
      showdownByMatchKey.get(matchKey) ?? null;

    const speciesSlug =
      pokeapiPokemon?.species?.name ??
      showdownEntry?.baseSpecies ??
      null;

    const pokeapiSpecies =
      speciesBySlug.get(speciesSlug) ??
      speciesBySlug.get(pokeapiPokemon?.name) ??
      null;

    if (pokeapiPokemon && showdownEntry) matchedBoth += 1;
    else if (pokeapiPokemon) pokeapiOnly += 1;
    else if (showdownEntry) showdownOnly += 1;

    normalizedPokemon.push(
      buildNormalizedPokemonRecord({
        matchKey,
        pokeapiPokemon,
        pokeapiSpecies,
        showdownEntry,
      })
    );
  }

  normalizedPokemon.sort((a, b) => {
    const dexA = a.identity.nationalDexNumber ?? Number.MAX_SAFE_INTEGER;
    const dexB = b.identity.nationalDexNumber ?? Number.MAX_SAFE_INTEGER;

    if (dexA !== dexB) return dexA - dexB;

    return a.identity.displayName.localeCompare(b.identity.displayName);
  });

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(normalizedPokemon, null, 2),
    "utf8"
  );

  console.log("\nPokémon normalization complete.");
  console.log(`Saved to: ${OUTPUT_FILE}`);
  console.log(`Total normalized records: ${normalizedPokemon.length}`);
  console.log(`Matched PokéAPI + Showdown: ${matchedBoth}`);
  console.log(`PokéAPI-only records: ${pokeapiOnly}`);
  console.log(`Showdown-only records: ${showdownOnly}`);
}

main();
