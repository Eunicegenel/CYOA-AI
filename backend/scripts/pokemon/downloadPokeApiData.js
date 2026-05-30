import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const POKEAPI_TARGET_DIR = path.join(
  __dirname,
  "../../data/pokemon/raw/pokeapi"
);

const POKEAPI_REPO_URL = "https://github.com/PokeAPI/api-data.git";

function downloadPokeApiData() {
  const gitFolderPath = path.join(POKEAPI_TARGET_DIR, ".git");

  if (fs.existsSync(gitFolderPath)) {
    console.log("PokéAPI data repo already exists.");
    console.log("Pulling the latest updates...\n");

    execSync(`git -C "${POKEAPI_TARGET_DIR}" pull`, {
      stdio: "inherit",
    });

    console.log("\nPokéAPI data updated.");
    return;
  }

  if (fs.existsSync(POKEAPI_TARGET_DIR)) {
    const existingFiles = fs.readdirSync(POKEAPI_TARGET_DIR);

    if (existingFiles.length > 0) {
      throw new Error(
        `The PokéAPI folder already exists and is not empty:\n${POKEAPI_TARGET_DIR}\n\nPlease empty it first, then run this script again.`
      );
    }
  }

  fs.mkdirSync(path.dirname(POKEAPI_TARGET_DIR), { recursive: true });

  console.log("Cloning PokéAPI offline data repo...\n");

  execSync(`git clone "${POKEAPI_REPO_URL}" "${POKEAPI_TARGET_DIR}"`, {
    stdio: "inherit",
  });

  console.log("\nPokéAPI data download complete.");
}

try {
  downloadPokeApiData();
} catch (error) {
  console.error("\nPokéAPI download failed:");
  console.error(error.message || error);
  process.exit(1);
}
