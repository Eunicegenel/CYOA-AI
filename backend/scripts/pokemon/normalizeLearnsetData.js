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

const SHOWDOWN_ROOT = path.join(RAW_ROOT, "showdown");

const OUTPUT_FILE = path.join(NORMALIZED_ROOT, "learnsets.json");

function ensureOutputFolder() {
  fs.mkdirSync(NORMALIZED_ROOT, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function titleCaseFromShowdownKey(value = "") {
  return String(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/-/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function decodeLearnsetMethod(code = "") {
  const raw = String(code);

  const generationMatch = raw.match(/^(\d+)/);
  const generation = generationMatch ? Number(generationMatch[1]) : null;

  const methodCode = raw.replace(/^\d+/, "").charAt(0) || null;
  const methodDetail = raw.replace(/^\d+[A-Z]?/, "") || null;

  const methodNameMap = {
    L: "Level-up",
    M: "Machine",
    T: "Tutor",
    E: "Egg move",
    S: "Event",
    D: "Dream World",
    V: "Virtual Console",
    R: "Restricted / special",
    C: "Contest or special compatibility",
  };

  return {
    raw,
    generation,
    methodCode,
    methodName: methodNameMap[methodCode] ?? "Unknown",
    detail: methodDetail,
  };
}

function normalizeMoveLearnMethods(methodCodes = []) {
  return methodCodes.map(decodeLearnsetMethod);
}

function summarizeLearnMethods(methods = []) {
  const names = [...new Set(methods.map((method) => method.methodName))];

  return {
    methodNames: names,
    generations: [
      ...new Set(
        methods
          .map((method) => method.generation)
          .filter((value) => value !== null)
      ),
    ].sort((a, b) => a - b),
  };
}

function normalizeLearnsetRecord(showdownPokemonKey, entry) {
  const learnset = entry?.learnset ?? {};

  const moves = Object.entries(learnset)
    .map(([moveKey, methodCodes]) => {
      const methods = normalizeMoveLearnMethods(methodCodes);
      const summary = summarizeLearnMethods(methods);

      return {
        moveKey,
        displayName: titleCaseFromShowdownKey(moveKey),
        methods,
        aiReadySummary: summary,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const learnsetData =
    entry?.eventData?.map((event) => ({
      generation: event?.generation ?? null,
      level: event?.level ?? null,
      shiny: event?.shiny ?? null,
      hiddenAbility: event?.hiddenAbility ?? null,
      gender: event?.gender ?? null,
      moves: event?.moves ?? [],
      pokeball: event?.pokeball ?? null,
      perfectIVs: event?.perfectIVs ?? null,
      isHidden: event?.isHidden ?? null,
      from: event?.from ?? null,
    })) ?? [];

  return {
    identity: {
      showdownPokemonKey,
      displayName: titleCaseFromShowdownKey(showdownPokemonKey),
    },

    moves,

    eventData: learnsetData,

    aiReadySummary: {
      moveCount: moves.length,
      eventDataCount: learnsetData.length,
      moveNames: moves.map((move) => move.displayName),
    },
  };
}

function main() {
  ensureOutputFolder();

  console.log("Loading Pokémon Showdown learnsets...");
  const showdownLearnsets = readJson(
    path.join(SHOWDOWN_ROOT, "learnsets.json")
  );

  const entries = Object.entries(showdownLearnsets);

  console.log(`Normalizing ${entries.length} learnset records...`);

  const normalizedLearnsets = entries
    .map(([showdownPokemonKey, entry]) =>
      normalizeLearnsetRecord(showdownPokemonKey, entry)
    )
    .sort((a, b) =>
      a.identity.displayName.localeCompare(b.identity.displayName)
    );

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(normalizedLearnsets, null, 2),
    "utf8"
  );

  console.log("\nLearnset normalization complete.");
  console.log(`Saved to: ${OUTPUT_FILE}`);
  console.log(`Total normalized records: ${normalizedLearnsets.length}`);
}

main();
