import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHOWDOWN_DATA_DIR = path.join(
  __dirname,
  "../../data/pokemon/raw/showdown"
);

const SHOWDOWN_FILES = [
  "pokedex.json",
  "moves.json",
  "learnsets.json",
  "abilities.js",
  "items.js",
];

async function downloadFile(fileName) {
  const url = `https://play.pokemonshowdown.com/data/${fileName}`;
  const outputPath = path.join(SHOWDOWN_DATA_DIR, fileName);

  console.log(`Downloading ${fileName}...`);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to download ${fileName}. Status: ${response.status}`
    );
  }

  const fileContent = await response.text();

  fs.writeFileSync(outputPath, fileContent, "utf8");

  console.log(`Saved ${fileName}`);
}

async function downloadShowdownData() {
  fs.mkdirSync(SHOWDOWN_DATA_DIR, { recursive: true });

  console.log("Starting Pokémon Showdown data download...\n");

  for (const fileName of SHOWDOWN_FILES) {
    await downloadFile(fileName);
  }

  console.log("\nPokémon Showdown data download complete.");
}

downloadShowdownData().catch((error) => {
  console.error("\nDownload failed:");
  console.error(error);
  process.exit(1);
});
