import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RAW_POKEMON_DIR = path.join(
  __dirname,
  "../../data/pokemon/raw"
);

const POKEAPI_V2_DIR = path.join(
  RAW_POKEMON_DIR,
  "pokeapi/data/api/v2"
);

const SHOWDOWN_DIR = path.join(
  RAW_POKEMON_DIR,
  "showdown"
);

const ANIME_LORE_DIR = path.join(
  RAW_POKEMON_DIR,
  "lore/anime"
);

const MANGA_LORE_DIR = path.join(
  RAW_POKEMON_DIR,
  "lore/manga"
);

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function countPokeApiResourceEntries(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;

  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => {
      return entry.isDirectory();
    })
    .length;
}

function countRootJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;

  return fs
    .readdirSync(dirPath)
    .filter((file) => file.endsWith(".json"))
    .length;
}

function countFilesInPagesDir(dirPath) {
  const pagesDir = path.join(dirPath, "pages");

  if (!fs.existsSync(pagesDir)) return 0;

  return fs
    .readdirSync(pagesDir)
    .filter((file) => file.endsWith(".json"))
    .length;
}

function countArrayEntriesFromJson(filePath) {
  const data = readJson(filePath);

  if (Array.isArray(data)) return data.length;
  if (data && typeof data === "object") return Object.keys(data).length;

  return 0;
}

function countFailedLoreEntries(filePath) {
  const data = readJson(filePath, []);

  return Array.isArray(data) ? data.length : 0;
}

function getLoreIndexSummary(filePath) {
  const data = readJson(filePath);

  if (!data) {
    return {
      discoveredPages: 0,
      downloadedThisRun: 0,
      skippedAlreadyExisting: 0,
      failedThisRun: 0,
    };
  }

  return {
    discoveredPages: data.totalPages ?? data.pages?.length ?? 0,
    downloadedThisRun: data.downloadStats?.downloadedThisRun ?? 0,
    skippedAlreadyExisting:
      data.downloadStats?.skippedAlreadyExisting ?? 0,
    failedThisRun: data.downloadStats?.failedThisRun ?? 0,
  };
}

function printSection(title) {
  console.log("\n" + "=".repeat(64));
  console.log(title);
  console.log("=".repeat(64));
}

function inspectPokeApi() {
  printSection("PokéAPI Game Data");

  const categories = [
    ["Pokémon", "pokemon"],
    ["Pokémon Species", "pokemon-species"],
    ["Pokémon Forms", "pokemon-form"],
    ["Moves", "move"],
    ["Abilities", "ability"],
    ["Items", "item"],
    ["Types", "type"],
    ["Evolution Chains", "evolution-chain"],
    ["Locations", "location"],
    ["Location Areas", "location-area"],
    ["Regions", "region"],
    ["Generations", "generation"],
    ["Versions", "version"],
    ["Version Groups", "version-group"],
    ["Pokédexes", "pokedex"],
  ];

  for (const [label, folderName] of categories) {
    const folderPath = path.join(POKEAPI_V2_DIR, folderName);
    const count = countPokeApiResourceEntries(folderPath);

    console.log(`${label.padEnd(24)} ${count}`);
  }
}

function inspectShowdown() {
  printSection("Pokémon Showdown Battle Data");

  const showdownFiles = [
    ["Pokédex Entries", "pokedex.json"],
    ["Moves", "moves.json"],
    ["Learnset Entries", "learnsets.json"],
  ];

  for (const [label, fileName] of showdownFiles) {
    const filePath = path.join(SHOWDOWN_DIR, fileName);
    const count = countArrayEntriesFromJson(filePath);

    console.log(`${label.padEnd(24)} ${count}`);
  }

  console.log(
    `${"Abilities File".padEnd(24)} ${
      fs.existsSync(path.join(SHOWDOWN_DIR, "abilities.js"))
        ? "Present"
        : "Missing"
    }`
  );

  console.log(
    `${"Items File".padEnd(24)} ${
      fs.existsSync(path.join(SHOWDOWN_DIR, "items.js"))
        ? "Present"
        : "Missing"
    }`
  );
}

function inspectLore() {
  printSection("Bulbapedia Lore Corpus");

  const animeIndex = getLoreIndexSummary(
    path.join(ANIME_LORE_DIR, "_anime_index.json")
  );

  const mangaIndex = getLoreIndexSummary(
    path.join(MANGA_LORE_DIR, "_manga_index.json")
  );

  const animeDownloadedPages = countFilesInPagesDir(ANIME_LORE_DIR);
  const mangaDownloadedPages = countFilesInPagesDir(MANGA_LORE_DIR);

  const animeFailures = countFailedLoreEntries(
    path.join(ANIME_LORE_DIR, "_anime_failed.json")
  );

  const mangaFailures = countFailedLoreEntries(
    path.join(MANGA_LORE_DIR, "_manga_failed.json")
  );

  console.log("Anime / Animation");
  console.log(
    `${"Discovered Pages".padEnd(24)} ${animeIndex.discoveredPages}`
  );
  console.log(
    `${"Downloaded Page Files".padEnd(24)} ${animeDownloadedPages}`
  );
  console.log(
    `${"Failed Downloads".padEnd(24)} ${animeFailures}`
  );

  console.log("\nManga");
  console.log(
    `${"Discovered Pages".padEnd(24)} ${mangaIndex.discoveredPages}`
  );
  console.log(
    `${"Downloaded Page Files".padEnd(24)} ${mangaDownloadedPages}`
  );
  console.log(
    `${"Failed Downloads".padEnd(24)} ${mangaFailures}`
  );
}

function inspectStarterLoreFiles() {
  printSection("Older Starter Lore Files Still Present");

  const animeStarterFiles = countRootJsonFiles(ANIME_LORE_DIR);
	const mangaStarterFiles = countRootJsonFiles(MANGA_LORE_DIR);

  console.log(
    `${"Anime root JSON files".padEnd(24)} ${animeStarterFiles}`
  );
  console.log(
    `${"Manga root JSON files".padEnd(24)} ${mangaStarterFiles}`
  );

  console.log(
    "\nNote: These include the small starter files and index/state files. " +
      "Our real full lore corpus lives inside each pages/ folder."
  );
}

function main() {
  console.log("\nPokémon Data Inventory Report");
  console.log("Generated:", new Date().toISOString());

  inspectPokeApi();
  inspectShowdown();
  inspectLore();
  inspectStarterLoreFiles();

  console.log("\n" + "=".repeat(64));
  console.log("Inventory scan complete.");
  console.log("=".repeat(64) + "\n");
}

main();
