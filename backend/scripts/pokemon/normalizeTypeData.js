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

const OUTPUT_FILE = path.join(NORMALIZED_ROOT, "types.json");

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

function parseResourceIdFromUrl(url = "") {
  const match = String(url).match(/\/(\d+)\/?$/);
  return match ? Number(match[1]) : null;
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

function extractEnglishName(type) {
  return (
    type?.names?.find((entry) => entry?.language?.name === "en")?.name ??
    titleCaseFromSlug(type?.name ?? "")
  );
}

function normalizeNamedRefs(entries = []) {
  return entries.map((entry) => ({
    slug: entry?.name ?? null,
    id: parseResourceIdFromUrl(entry?.url),
    displayName: titleCaseFromSlug(entry?.name ?? ""),
  }));
}

function normalizeDamageRelations(type) {
  const relations = type?.damage_relations ?? {};

  return {
    doubleDamageFrom: normalizeNamedRefs(relations.double_damage_from),
    doubleDamageTo: normalizeNamedRefs(relations.double_damage_to),

    halfDamageFrom: normalizeNamedRefs(relations.half_damage_from),
    halfDamageTo: normalizeNamedRefs(relations.half_damage_to),

    noDamageFrom: normalizeNamedRefs(relations.no_damage_from),
    noDamageTo: normalizeNamedRefs(relations.no_damage_to),
  };
}

function normalizePastDamageRelations(type) {
  return (type?.past_damage_relations ?? []).map((entry) => ({
    generation: entry?.generation?.name ?? null,
    damageRelations: {
      doubleDamageFrom: normalizeNamedRefs(
        entry?.damage_relations?.double_damage_from
      ),
      doubleDamageTo: normalizeNamedRefs(
        entry?.damage_relations?.double_damage_to
      ),

      halfDamageFrom: normalizeNamedRefs(
        entry?.damage_relations?.half_damage_from
      ),
      halfDamageTo: normalizeNamedRefs(
        entry?.damage_relations?.half_damage_to
      ),

      noDamageFrom: normalizeNamedRefs(
        entry?.damage_relations?.no_damage_from
      ),
      noDamageTo: normalizeNamedRefs(
        entry?.damage_relations?.no_damage_to
      ),
    },
  }));
}

function normalizePokemonRefs(type) {
  return (type?.pokemon ?? []).map((entry) => ({
    slot: entry?.slot ?? null,
    pokemonSlug: entry?.pokemon?.name ?? null,
    pokemonId: parseResourceIdFromUrl(entry?.pokemon?.url),
  }));
}

function normalizeMoveRefs(type) {
  return (type?.moves ?? []).map((move) => ({
    moveSlug: move?.name ?? null,
    moveId: parseResourceIdFromUrl(move?.url),
  }));
}

function buildNormalizedTypeRecord(type) {
  const displayName = extractEnglishName(type);
  const damageRelations = normalizeDamageRelations(type);

  return {
    identity: {
      displayName,
      slug: type?.name ?? null,
      pokeapiTypeId: type?.id ?? null,
    },

    generation: type?.generation?.name ?? null,

    damageRelations,
    pastDamageRelations: normalizePastDamageRelations(type),

    associatedContent: {
      pokemon: normalizePokemonRefs(type),
      moves: normalizeMoveRefs(type),
    },

    aiReadySummary: {
      attacking: {
        superEffectiveAgainst:
          damageRelations.doubleDamageTo.map((entry) => entry.displayName),
        resistedBy:
          damageRelations.halfDamageTo.map((entry) => entry.displayName),
        ineffectiveAgainst:
          damageRelations.noDamageTo.map((entry) => entry.displayName),
      },

      defending: {
        weakTo:
          damageRelations.doubleDamageFrom.map((entry) => entry.displayName),
        resists:
          damageRelations.halfDamageFrom.map((entry) => entry.displayName),
        immuneTo:
          damageRelations.noDamageFrom.map((entry) => entry.displayName),
      },
    },
  };
}

function main() {
  ensureOutputFolder();

  console.log("Loading PokéAPI types...");
  const pokeapiTypes = readPokeApiResourceCollection("type");

  console.log(`Normalizing ${pokeapiTypes.length} type records...`);

  const normalizedTypes = pokeapiTypes
    .map(buildNormalizedTypeRecord)
    .sort((a, b) =>
      a.identity.displayName.localeCompare(b.identity.displayName)
    );

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(normalizedTypes, null, 2),
    "utf8"
  );

  console.log("\nType normalization complete.");
  console.log(`Saved to: ${OUTPUT_FILE}`);
  console.log(`Total normalized records: ${normalizedTypes.length}`);
}

main();
