import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NORMALIZED_ROOT = path.join(
  __dirname,
  "../../data/pokemon/normalized"
);

const ITEMS_FILE = path.join(NORMALIZED_ROOT, "items.json");

const OUTPUT_FILE = path.join(
  NORMALIZED_ROOT,
  "_item_normalization_audit.json"
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function simplifyRecord(record) {
  return {
    matchKey: record.matchKey,
    displayName: record.identity?.displayName ?? null,
    pokeapiSlug: record.identity?.pokeapiSlug ?? null,
    pokeapiItemId: record.identity?.pokeapiItemId ?? null,
    showdownKey: record.identity?.showdownKey ?? null,

    category: record.aiReadySummary?.category ?? null,
    pocket: record.aiReadySummary?.pocket ?? null,
    isBattleRelevant:
      record.aiReadySummary?.isBattleRelevant ?? false,
    isNonstandard:
      record.aiReadySummary?.isNonstandard ?? null,

    sourceCoverage: record.sourceCoverage,
  };
}

function sortByDisplayName(a, b) {
  return a.displayName.localeCompare(b.displayName);
}

function main() {
  console.log("Loading normalized item records...");

  const items = readJson(ITEMS_FILE);

  const matchedBoth = [];
  const pokeapiOnly = [];
  const showdownOnly = [];
  const neither = [];

  for (const record of items) {
    const hasPokeApiItem = Boolean(
      record.sourceCoverage?.hasPokeApiItem
    );

    const hasShowdownItem = Boolean(
      record.sourceCoverage?.hasShowdownItem
    );

    const simplified = simplifyRecord(record);

    if (hasPokeApiItem && hasShowdownItem) {
      matchedBoth.push(simplified);
    } else if (hasPokeApiItem) {
      pokeapiOnly.push(simplified);
    } else if (hasShowdownItem) {
      showdownOnly.push(simplified);
    } else {
      neither.push(simplified);
    }
  }

  matchedBoth.sort(sortByDisplayName);
  pokeapiOnly.sort(sortByDisplayName);
  showdownOnly.sort(sortByDisplayName);
  neither.sort(sortByDisplayName);

  const audit = {
    generatedAt: new Date().toISOString(),

    totals: {
      allNormalizedRecords: items.length,
      matchedBoth: matchedBoth.length,
      pokeapiOnly: pokeapiOnly.length,
      showdownOnly: showdownOnly.length,
      neither: neither.length,
    },

    preview: {
      matchedBothFirst25: matchedBoth.slice(0, 25),
      pokeapiOnlyFirst100: pokeapiOnly.slice(0, 100),
      showdownOnlyFirst100: showdownOnly.slice(0, 100),
      neither,
    },

    fullLists: {
      pokeapiOnly,
      showdownOnly,
      neither,
    },
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(audit, null, 2), "utf8");

  console.log("\nItem normalization audit complete.");
  console.log(`Saved to: ${OUTPUT_FILE}`);
  console.log("");
  console.log(`All normalized records: ${items.length}`);
  console.log(`Matched both sources:   ${matchedBoth.length}`);
  console.log(`PokéAPI-only:           ${pokeapiOnly.length}`);
  console.log(`Showdown-only:          ${showdownOnly.length}`);
  console.log(`Neither:                ${neither.length}`);

  console.log("\nPokéAPI-only preview:");
  for (const entry of pokeapiOnly.slice(0, 25)) {
    console.log(`- ${entry.displayName}`);
  }

  console.log("\nShowdown-only preview:");
  for (const entry of showdownOnly.slice(0, 25)) {
    console.log(`- ${entry.displayName}`);
  }
}

main();
