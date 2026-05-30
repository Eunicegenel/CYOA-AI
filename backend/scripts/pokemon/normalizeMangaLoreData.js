import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RAW_MANGA_PAGES_DIR = path.join(
  __dirname,
  "../../data/pokemon/raw/lore/manga/pages"
);

const NORMALIZED_MANGA_DIR = path.join(
  __dirname,
  "../../data/pokemon/normalized/lore/manga"
);

const NORMALIZED_PAGES_DIR = path.join(
  NORMALIZED_MANGA_DIR,
  "pages"
);

const INDEX_FILE = path.join(
  NORMALIZED_MANGA_DIR,
  "_manga_lore_index.json"
);

const FAILED_FILE = path.join(
  NORMALIZED_MANGA_DIR,
  "_manga_lore_failed.json"
);

function ensureFolders() {
  fs.mkdirSync(NORMALIZED_MANGA_DIR, { recursive: true });
  fs.mkdirSync(NORMALIZED_PAGES_DIR, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function safeReadJson(filePath) {
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function removeHtmlComments(text = "") {
  return text.replace(/<!--[\s\S]*?-->/g, " ");
}

function removeRefTags(text = "") {
  return text
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, " ")
    .replace(/<ref\b[^/>]*\/>/gi, " ");
}

function removeTables(text = "") {
  return text.replace(/\{\|[\s\S]*?\|\}/g, " ");
}

function removeTemplates(text = "") {
  let cleaned = text;
  let previous;

  do {
    previous = cleaned;
    cleaned = cleaned.replace(/\{\{[^{}]*\}\}/g, " ");
  } while (cleaned !== previous);

  return cleaned;
}

function cleanWikiLinks(text = "") {
  return text
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1");
}

function cleanExternalLinks(text = "") {
  return text
    .replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, "$1")
    .replace(/\[https?:\/\/[^\]]+\]/g, " ");
}

function removeCategoriesAndFiles(text = "") {
  return text
    .replace(/\[\[Category:[^\]]+\]\]/gi, " ")
    .replace(/\[\[(File|Image):[^\]]+\]\]/gi, " ");
}

function removeMagicWords(text = "") {
  return text
    .replace(/__NOTOC__/gi, " ")
    .replace(/__TOC__/gi, " ")
    .replace(/__NOINDEX__/gi, " ");
}

function cleanHtmlTags(text = "") {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(
      /<\/?(small|big|center|div|span|sup|sub|i|b|u|em|strong|blockquote|poem|gallery|nowiki|includeonly|noinclude)[^>]*>/gi,
      " "
    )
    .replace(/<[^>]+>/g, " ");
}

function cleanBoldItalic(text = "") {
  return text
    .replace(/'''''/g, "")
    .replace(/'''/g, "")
    .replace(/''/g, "");
}

function cleanListMarkers(text = "") {
  return text
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*[*#;:]+\s*/, "")
        .replace(/^\s*\|[-+]?.*$/g, "")
    )
    .join("\n");
}

function normalizeWhitespace(text = "") {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+|\s+$/g, "")
    .trim();
}

function cleanWikitext(wikitext = "") {
  let text = String(wikitext ?? "");

  text = removeHtmlComments(text);
  text = removeRefTags(text);
  text = removeTables(text);
  text = removeTemplates(text);
  text = removeCategoriesAndFiles(text);
  text = removeMagicWords(text);
  text = cleanWikiLinks(text);
  text = cleanExternalLinks(text);
  text = cleanHtmlTags(text);
  text = cleanBoldItalic(text);
  text = cleanListMarkers(text);
  text = normalizeWhitespace(text);

  return text;
}

function extractSections(cleanedText = "") {
  const lines = cleanedText.split("\n");

  const sections = [];
  let currentSection = {
    heading: "Lead",
    level: 0,
    textLines: [],
  };

  const headingPattern = /^(={2,6})\s*(.*?)\s*\1$/;

  for (const line of lines) {
    const headingMatch = line.match(headingPattern);

    if (headingMatch) {
      const completedText = normalizeWhitespace(
        currentSection.textLines.join("\n")
      );

      if (completedText) {
        sections.push({
          heading: currentSection.heading,
          level: currentSection.level,
          text: completedText,
        });
      }

      currentSection = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
        textLines: [],
      };

      continue;
    }

    currentSection.textLines.push(line);
  }

  const finalText = normalizeWhitespace(currentSection.textLines.join("\n"));

  if (finalText) {
    sections.push({
      heading: currentSection.heading,
      level: currentSection.level,
      text: finalText,
    });
  }

  return sections;
}

function extractLeadText(sections = []) {
  return sections.find((section) => section.heading === "Lead")?.text ?? "";
}

function estimatePageType({ title = "", categorySource = "" }) {
  const haystack = `${title} ${categorySource}`.toLowerCase();

  if (
    haystack.includes("chapter") ||
    haystack.includes("round") ||
    /\bchapter\b/i.test(title)
  ) {
    return "chapter";
  }

  if (haystack.includes("arc")) {
    return "arc";
  }

  if (haystack.includes("character")) {
    return "character";
  }

  if (haystack.includes("location")) {
    return "location";
  }

  if (haystack.includes("pokémon") || haystack.includes("pokemon")) {
    return "pokemon-related";
  }

  if (haystack.includes("manga")) {
    return "manga-series";
  }

  return "general-manga-lore";
}

function normalizeMangaLorePage(rawPage, sourceFileName) {
  const cleanedText = cleanWikitext(rawPage?.wikitext ?? "");
  const sections = extractSections(cleanedText);

  return {
    identity: {
      title: rawPage?.resolvedTitle ?? rawPage?.requestedTitle ?? null,
      slug: slugify(rawPage?.resolvedTitle ?? rawPage?.requestedTitle ?? ""),
      pageId: rawPage?.pageId ?? null,
      revisionId: rawPage?.revisionId ?? null,
    },

    canon: "manga",

    source: {
      provider: rawPage?.source ?? "Bulbapedia",
      sourceType: rawPage?.sourceType ?? "MediaWiki API",
      sourceCategory: rawPage?.categorySource ?? null,
      sourceFileName,
      revisionTimestamp: rawPage?.revisionTimestamp ?? null,
      fetchedAt: rawPage?.fetchedAt ?? null,
    },

    classification: {
      estimatedPageType: estimatePageType({
        title: rawPage?.resolvedTitle ?? rawPage?.requestedTitle ?? "",
        categorySource: rawPage?.categorySource ?? "",
      }),
    },

    leadText: extractLeadText(sections),
    plainText: cleanedText,
    sections,

    aiReadySummary: {
      title: rawPage?.resolvedTitle ?? rawPage?.requestedTitle ?? null,
      pageType: estimatePageType({
        title: rawPage?.resolvedTitle ?? rawPage?.requestedTitle ?? "",
        categorySource: rawPage?.categorySource ?? "",
      }),
      searchableText: [
        rawPage?.resolvedTitle ?? rawPage?.requestedTitle ?? "",
        rawPage?.categorySource ?? "",
        extractLeadText(sections),
      ]
        .filter(Boolean)
        .join("\n"),
      sectionHeadings: sections.map((section) => section.heading),
      characterCount: cleanedText.length,
      sectionCount: sections.length,
    },
  };
}

function main() {
  ensureFolders();

  console.log("Loading raw manga lore pages...");

  const rawFiles = fs
    .readdirSync(RAW_MANGA_PAGES_DIR)
    .filter((file) => file.endsWith(".json"));

  console.log(`Found ${rawFiles.length} manga lore page files.`);
  console.log("Normalizing manga lore pages...\n");

  const index = [];
  const failures = [];

  let normalizedCount = 0;
  let skippedCount = 0;

  for (const sourceFileName of rawFiles) {
    const rawFilePath = path.join(RAW_MANGA_PAGES_DIR, sourceFileName);
    const rawPage = safeReadJson(rawFilePath);

    if (!rawPage) {
      failures.push({
        sourceFileName,
        error: "Could not parse raw JSON file.",
      });
      continue;
    }

    const pageId = rawPage?.pageId ?? "unknown";
    const title = rawPage?.resolvedTitle ?? rawPage?.requestedTitle ?? "untitled";
    const outputFileName = `${slugify(title) || "untitled"}__${pageId}.json`;
    const outputPath = path.join(NORMALIZED_PAGES_DIR, outputFileName);

    if (fs.existsSync(outputPath)) {
      skippedCount += 1;
      continue;
    }

    try {
      const normalizedPage = normalizeMangaLorePage(rawPage, sourceFileName);

      writeJson(outputPath, normalizedPage);

      index.push({
        title: normalizedPage.identity.title,
        slug: normalizedPage.identity.slug,
        pageId: normalizedPage.identity.pageId,
        estimatedPageType:
          normalizedPage.classification.estimatedPageType,
        sectionCount: normalizedPage.aiReadySummary.sectionCount,
        characterCount: normalizedPage.aiReadySummary.characterCount,
        outputFileName,
      });

      normalizedCount += 1;

      if (normalizedCount % 250 === 0) {
        console.log(`Normalized ${normalizedCount} manga pages...`);
      }
    } catch (error) {
      failures.push({
        sourceFileName,
        title,
        error: error.message,
      });
    }
  }

  index.sort((a, b) => a.title.localeCompare(b.title));

  writeJson(INDEX_FILE, {
    generatedAt: new Date().toISOString(),
    canon: "manga",
    totalNormalizedThisRun: normalizedCount,
    skippedAlreadyExisting: skippedCount,
    failedThisRun: failures.length,
    pages: index,
  });

  writeJson(FAILED_FILE, failures);

  console.log("\nManga lore normalization complete.");
  console.log(`Normalized this run: ${normalizedCount}`);
  console.log(`Skipped already existing: ${skippedCount}`);
  console.log(`Failed this run: ${failures.length}`);
  console.log(`Saved normalized pages to: ${NORMALIZED_PAGES_DIR}`);
}

main();
