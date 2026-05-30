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

const OUTPUT_FILE = path.join(NORMALIZED_ROOT, "evolutions.json");

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

function normalizeNamedRef(resource) {
  if (!resource) return null;

  return {
    slug: resource.name ?? null,
    id: parseResourceIdFromUrl(resource.url),
    displayName: titleCaseFromSlug(resource.name ?? ""),
  };
}

function normalizeEvolutionDetail(detail = {}) {
  return {
    trigger: normalizeNamedRef(detail.trigger),

    minLevel: detail.min_level ?? null,
    minHappiness: detail.min_happiness ?? null,
    minBeauty: detail.min_beauty ?? null,
    minAffection: detail.min_affection ?? null,

    gender: detail.gender ?? null,
    needsOverworldRain: detail.needs_overworld_rain ?? false,
    turnUpsideDown: detail.turn_upside_down ?? false,

    timeOfDay: detail.time_of_day || null,
    relativePhysicalStats: detail.relative_physical_stats ?? null,

    item: normalizeNamedRef(detail.item),
    heldItem: normalizeNamedRef(detail.held_item),
    knownMove: normalizeNamedRef(detail.known_move),
    knownMoveType: normalizeNamedRef(detail.known_move_type),
    location: normalizeNamedRef(detail.location),
    partySpecies: normalizeNamedRef(detail.party_species),
    partyType: normalizeNamedRef(detail.party_type),
    tradeSpecies: normalizeNamedRef(detail.trade_species),
  };
}

function simplifyEvolutionRequirement(detail) {
  if (!detail) return "Unknown evolution condition";

  const parts = [];

  const trigger = detail.trigger?.displayName ?? null;

  if (trigger) {
    parts.push(`Trigger: ${trigger}`);
  }

  if (detail.minLevel !== null) {
    parts.push(`Level ${detail.minLevel}+`);
  }

  if (detail.minHappiness !== null) {
    parts.push(`Happiness ${detail.minHappiness}+`);
  }

  if (detail.minBeauty !== null) {
    parts.push(`Beauty ${detail.minBeauty}+`);
  }

  if (detail.minAffection !== null) {
    parts.push(`Affection ${detail.minAffection}+`);
  }

  if (detail.gender !== null) {
    parts.push(`Gender code ${detail.gender}`);
  }

  if (detail.timeOfDay) {
    parts.push(`Time: ${detail.timeOfDay}`);
  }

  if (detail.item?.displayName) {
    parts.push(`Use ${detail.item.displayName}`);
  }

  if (detail.heldItem?.displayName) {
    parts.push(`Holding ${detail.heldItem.displayName}`);
  }

  if (detail.knownMove?.displayName) {
    parts.push(`Knows ${detail.knownMove.displayName}`);
  }

  if (detail.knownMoveType?.displayName) {
    parts.push(`Knows ${detail.knownMoveType.displayName}-type move`);
  }

  if (detail.location?.displayName) {
    parts.push(`At ${detail.location.displayName}`);
  }

  if (detail.partySpecies?.displayName) {
    parts.push(`Party includes ${detail.partySpecies.displayName}`);
  }

  if (detail.partyType?.displayName) {
    parts.push(`Party includes ${detail.partyType.displayName}-type Pokémon`);
  }

  if (detail.tradeSpecies?.displayName) {
    parts.push(`Trade for ${detail.tradeSpecies.displayName}`);
  }

  if (detail.needsOverworldRain) {
    parts.push("Requires overworld rain");
  }

  if (detail.turnUpsideDown) {
    parts.push("Device upside down");
  }

  if (detail.relativePhysicalStats !== null) {
    const statMeaning =
      detail.relativePhysicalStats === 1
        ? "Attack > Defense"
        : detail.relativePhysicalStats === -1
        ? "Attack < Defense"
        : "Attack = Defense";

    parts.push(statMeaning);
  }

  return parts.length > 0
    ? parts.join("; ")
    : "No special condition recorded";
}

function buildEvolutionNode(chainNode, depth = 0) {
  const species = normalizeNamedRef(chainNode?.species);

  const normalizedEvolutionDetails =
    chainNode?.evolution_details?.map(normalizeEvolutionDetail) ?? [];

  return {
    species,
    depth,

    evolutionDetails: normalizedEvolutionDetails,

    aiReadyEvolutionRequirements:
      normalizedEvolutionDetails.map(simplifyEvolutionRequirement),

    evolvesTo:
      chainNode?.evolves_to?.map((nextNode) =>
        buildEvolutionNode(nextNode, depth + 1)
      ) ?? [],
  };
}

function collectFlattenedEdges(node, parentSpecies = null, edges = []) {
  if (!node) return edges;

  if (parentSpecies && node.species) {
    edges.push({
      from: parentSpecies,
      to: node.species,
      requirements: node.evolutionDetails ?? [],
      aiReadyRequirements: node.aiReadyEvolutionRequirements ?? [],
    });
  }

  for (const child of node.evolvesTo ?? []) {
    collectFlattenedEdges(child, node.species, edges);
  }

  return edges;
}

function collectSpeciesInTree(node, collector = []) {
  if (!node) return collector;

  if (node.species) {
    collector.push(node.species);
  }

  for (const child of node.evolvesTo ?? []) {
    collectSpeciesInTree(child, collector);
  }

  return collector;
}

function buildReadableEvolutionPaths(node, currentPath = [], paths = []) {
  if (!node?.species) return paths;

  const nextPath = [...currentPath, node.species.displayName];

  if (!node.evolvesTo || node.evolvesTo.length === 0) {
    paths.push(nextPath);
    return paths;
  }

  for (const child of node.evolvesTo) {
    buildReadableEvolutionPaths(child, nextPath, paths);
  }

  return paths;
}

function buildNormalizedEvolutionRecord(chain) {
  const tree = buildEvolutionNode(chain?.chain, 0);
  const flattenedEdges = collectFlattenedEdges(tree);
  const speciesInChain = collectSpeciesInTree(tree);
  const readablePaths = buildReadableEvolutionPaths(tree);

  return {
    identity: {
      evolutionChainId: chain?.id ?? null,
      baseSpecies: tree?.species ?? null,
      babyTriggerItem: normalizeNamedRef(chain?.baby_trigger_item),
    },

    tree,
    flattenedEdges,
    speciesInChain,

    aiReadySummary: {
      baseSpecies: tree?.species?.displayName ?? null,
      speciesCount: speciesInChain.length,
      evolutionStepCount: flattenedEdges.length,
      readablePaths,
    },
  };
}

function main() {
  ensureOutputFolder();

  console.log("Loading PokéAPI evolution chains...");
  const evolutionChains =
    readPokeApiResourceCollection("evolution-chain");

  console.log(
    `Normalizing ${evolutionChains.length} evolution chain records...`
  );

  const normalizedEvolutions = evolutionChains
    .map(buildNormalizedEvolutionRecord)
    .sort((a, b) => {
      const idA = a.identity.evolutionChainId ?? Number.MAX_SAFE_INTEGER;
      const idB = b.identity.evolutionChainId ?? Number.MAX_SAFE_INTEGER;
      return idA - idB;
    });

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(normalizedEvolutions, null, 2),
    "utf8"
  );

  console.log("\nEvolution normalization complete.");
  console.log(`Saved to: ${OUTPUT_FILE}`);
  console.log(`Total normalized records: ${normalizedEvolutions.length}`);
}

main();
