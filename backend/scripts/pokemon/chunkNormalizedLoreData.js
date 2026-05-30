import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NORMALIZED_LORE_ROOT = path.join(
  __dirname,
  "../../data/pokemon/normalized/lore"
);

const CHUNK_TARGET_CHAR_LENGTH = 1800;
const CHUNK_MIN_CHAR_LENGTH = 250;

const LORE_CONFIGS = [
  {
    canon: "anime",
    pagesDir: path.join(NORMALIZED_LORE_ROOT, "anime/pages"),
    outputFile: path.join(NORMALIZED_LORE_ROOT, "anime/chunks.json"),
    summaryFile: path.join(
      NORMALIZED_LORE_ROOT,
      "anime/_anime_chunk_summary.json"
    ),
  },
  {
    canon: "manga",
    pagesDir: path.join(NORMALIZED_LORE_ROOT, "manga/pages"),
    outputFile: path.join(NORMALIZED_LORE_ROOT, "manga/chunks.json"),
    summaryFile: path.join(
      NORMALIZED_LORE_ROOT,
      "manga/_manga_chunk_summary.json"
    ),
  },
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeWhitespace(text = "") {
  return String(text)
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitParagraphs(text = "") {
  return normalizeWhitespace(text)
    .split(/\n{2,}/g)
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter(Boolean);
}

function splitLongParagraph(paragraph = "", targetLength = CHUNK_TARGET_CHAR_LENGTH) {
  const sentences = paragraph
    .split(/(?<=[.!?])\s+/g)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length <= 1) {
    const roughChunks = [];

    for (let i = 0; i < paragraph.length; i += targetLength) {
      roughChunks.push(paragraph.slice(i, i + targetLength).trim());
    }

    return roughChunks.filter(Boolean);
  }

  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
      continue;
    }

    if ((current + " " + sentence).length <= targetLength) {
      current += ` ${sentence}`;
    } else {
      chunks.push(current.trim());
      current = sentence;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

function chunkSectionText(sectionText = "") {
  const paragraphs = splitParagraphs(sectionText);
  const chunks = [];

  let currentChunk = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > CHUNK_TARGET_CHAR_LENGTH) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }

      chunks.push(...splitLongParagraph(paragraph));
      continue;
    }

    if (!currentChunk) {
      currentChunk = paragraph;
      continue;
    }

    if ((currentChunk + "\n\n" + paragraph).length <= CHUNK_TARGET_CHAR_LENGTH) {
      currentChunk += `\n\n${paragraph}`;
    } else {
      chunks.push(currentChunk.trim());
      currentChunk = paragraph;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter((chunk) => chunk.length >= CHUNK_MIN_CHAR_LENGTH);
}

function buildChunkSearchText({
  canon,
  title,
  pageType,
  heading,
  text,
}) {
  return [
    canon,
    title,
    pageType,
    heading,
    text,
  ]
    .filter(Boolean)
    .join("\n");
}

function createChunksForPage(page, sourceFileName, canon) {
  const title = page?.identity?.title ?? "Untitled";
  const slug = page?.identity?.slug ?? null;
  const pageId = page?.identity?.pageId ?? null;
  const pageType = page?.classification?.estimatedPageType ?? "unknown";
  const sourceCategory = page?.source?.sourceCategory ?? null;
  const sections = page?.sections ?? [];

  const chunks = [];

  sections.forEach((section, sectionIndex) => {
    const heading = section?.heading ?? "Unknown";
    const level = section?.level ?? null;
    const text = normalizeWhitespace(section?.text ?? "");

    if (!text || text.length < CHUNK_MIN_CHAR_LENGTH) {
      return;
    }

    const sectionChunks = chunkSectionText(text);

    sectionChunks.forEach((chunkText, chunkIndexWithinSection) => {
      const chunkId = [
        canon,
        pageId ?? "unknown-page",
        sectionIndex,
        chunkIndexWithinSection,
      ].join(":");

      chunks.push({
        chunkId,

        canon,

        page: {
          title,
          slug,
          pageId,
          pageType,
          sourceCategory,
          sourceFileName,
        },

        section: {
          heading,
          level,
          sectionIndex,
          chunkIndexWithinSection,
        },

        text: chunkText,

        searchText: buildChunkSearchText({
          canon,
          title,
          pageType,
          heading,
          text: chunkText,
        }),

        metadata: {
          characterCount: chunkText.length,
        },
      });
    });
  });

  return chunks;
}

function processLoreCorpus(config) {
  const { canon, pagesDir, outputFile, summaryFile } = config;

  console.log(`\nProcessing ${canon} lore chunks...`);

  const files = fs
    .readdirSync(pagesDir)
    .filter((file) => file.endsWith(".json"));

  console.log(`Found ${files.length} normalized ${canon} lore pages.`);

  const allChunks = [];

  let processedPages = 0;
  let pagesWithChunks = 0;
  let pagesWithoutChunks = 0;

  for (const fileName of files) {
    const filePath = path.join(pagesDir, fileName);
    const page = readJson(filePath);

    const chunks = createChunksForPage(page, fileName, canon);

    processedPages += 1;

    if (chunks.length > 0) {
      pagesWithChunks += 1;
      allChunks.push(...chunks);
    } else {
      pagesWithoutChunks += 1;
    }

    if (processedPages % 500 === 0) {
      console.log(
        `Processed ${processedPages} ${canon} pages, created ${allChunks.length} chunks...`
      );
    }
  }

  writeJson(outputFile, allChunks);

  writeJson(summaryFile, {
    generatedAt: new Date().toISOString(),
    canon,
    chunkingRules: {
      targetCharacterLength: CHUNK_TARGET_CHAR_LENGTH,
      minimumCharacterLength: CHUNK_MIN_CHAR_LENGTH,
    },
    totals: {
      processedPages,
      pagesWithChunks,
      pagesWithoutChunks,
      totalChunks: allChunks.length,
    },
  });

  console.log(`\n${canon} chunking complete.`);
  console.log(`Processed pages:       ${processedPages}`);
  console.log(`Pages with chunks:     ${pagesWithChunks}`);
  console.log(`Pages without chunks:  ${pagesWithoutChunks}`);
  console.log(`Total chunks created:  ${allChunks.length}`);
  console.log(`Saved chunks to:       ${outputFile}`);
}

function main() {
  console.log("Starting normalized lore chunk generation...");

  for (const config of LORE_CONFIGS) {
    processLoreCorpus(config);
  }

  console.log("\nAll lore chunk files generated.");
}

main();
