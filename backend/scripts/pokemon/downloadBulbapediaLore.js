import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ANIME_OUTPUT_DIR = path.join(
  __dirname,
  "../../data/pokemon/raw/lore/anime"
);

const PAGES_DIR = path.join(ANIME_OUTPUT_DIR, "pages");

const INDEX_PATH = path.join(ANIME_OUTPUT_DIR, "_anime_index.json");
const CATEGORY_INDEX_PATH = path.join(
  ANIME_OUTPUT_DIR,
  "_anime_categories.json"
);
const FAILED_PATH = path.join(ANIME_OUTPUT_DIR, "_anime_failed.json");
const STATE_PATH = path.join(ANIME_OUTPUT_DIR, "_anime_crawl_state.json");

const BULBAPEDIA_API_URL =
  "https://bulbapedia.bulbagarden.net/w/api.php";

const ROOT_CATEGORY = "Category:Animation";

const REQUEST_DELAY_MS = 350;
const PAGE_DOWNLOAD_DELAY_MS = 300;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureFolders() {
  fs.mkdirSync(ANIME_OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(PAGES_DIR, { recursive: true });
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function slugifyFileName(title) {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/['’]/g, "")
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function safeFileNameFromPage(title, pageId) {
  const slug = slugifyFileName(title) || "untitled";
  return `${slug}__${pageId}.json`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "CYOA-AI Pokemon Animation Lore Downloader/1.0 (local development project)",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

async function fetchCategoryMembers(categoryTitle, cmcontinue = null) {
  const params = new URLSearchParams({
    action: "query",
    list: "categorymembers",
    cmtitle: categoryTitle,
    cmprop: "ids|title|type",
    cmtype: "page|subcat",
    cmlimit: "500",
    format: "json",
    formatversion: "2",
  });

  if (cmcontinue) {
    params.set("cmcontinue", cmcontinue);
  }

  const url = `${BULBAPEDIA_API_URL}?${params.toString()}`;
  const data = await fetchJson(url);

  return {
    members: data?.query?.categorymembers || [],
    nextContinue: data?.continue?.cmcontinue || null,
  };
}

async function fetchFullCategoryMembers(categoryTitle) {
  const allMembers = [];
  let cmcontinue = null;

  do {
    const result = await fetchCategoryMembers(categoryTitle, cmcontinue);

    allMembers.push(...result.members);
    cmcontinue = result.nextContinue;

    await sleep(REQUEST_DELAY_MS);
  } while (cmcontinue);

  return allMembers;
}

async function crawlAnimationCategoryTree() {
  console.log("Discovering every page under Category:Animation...\n");

  const state = readJsonIfExists(STATE_PATH, {
    rootCategory: ROOT_CATEGORY,
    categoryQueue: [ROOT_CATEGORY],
    visitedCategories: [],
    discoveredPages: [],
    completedCategoryTraversal: false,
  });

  const categoryQueue = [...state.categoryQueue];
  const visitedCategories = new Set(state.visitedCategories);
  const discoveredPagesMap = new Map(
    state.discoveredPages.map((page) => [page.pageId, page])
  );

  while (categoryQueue.length > 0) {
    const currentCategory = categoryQueue.shift();

    if (visitedCategories.has(currentCategory)) {
      continue;
    }

    console.log(`Scanning category: ${currentCategory}`);

    try {
      const members = await fetchFullCategoryMembers(currentCategory);

      for (const member of members) {
        if (member.type === "subcat") {
          if (!visitedCategories.has(member.title)) {
            categoryQueue.push(member.title);
          }
        }

        if (member.type === "page") {
          discoveredPagesMap.set(member.pageid, {
            pageId: member.pageid,
            title: member.title,
            sourceCategory: currentCategory,
          });
        }
      }

      visitedCategories.add(currentCategory);

      writeJson(STATE_PATH, {
        rootCategory: ROOT_CATEGORY,
        categoryQueue,
        visitedCategories: [...visitedCategories],
        discoveredPages: [...discoveredPagesMap.values()],
        completedCategoryTraversal: false,
      });

      console.log(
        `  Categories found so far: ${visitedCategories.size}`
      );
      console.log(
        `  Pages found so far: ${discoveredPagesMap.size}\n`
      );
    } catch (error) {
      console.error(`Failed to scan category: ${currentCategory}`);
      console.error(`Reason: ${error.message}\n`);

      // Put it back at the end so a later rerun can try again.
      categoryQueue.push(currentCategory);

      writeJson(STATE_PATH, {
        rootCategory: ROOT_CATEGORY,
        categoryQueue,
        visitedCategories: [...visitedCategories],
        discoveredPages: [...discoveredPagesMap.values()],
        completedCategoryTraversal: false,
      });

      await sleep(1000);
    }
  }

  const discoveredPages = [...discoveredPagesMap.values()].sort((a, b) =>
    a.title.localeCompare(b.title)
  );

  const categories = [...visitedCategories].sort((a, b) =>
    a.localeCompare(b)
  );

  writeJson(CATEGORY_INDEX_PATH, {
    rootCategory: ROOT_CATEGORY,
    totalCategories: categories.length,
    categories,
    generatedAt: new Date().toISOString(),
  });

  writeJson(INDEX_PATH, {
    rootCategory: ROOT_CATEGORY,
    totalPages: discoveredPages.length,
    pages: discoveredPages,
    generatedAt: new Date().toISOString(),
  });

  writeJson(STATE_PATH, {
    rootCategory: ROOT_CATEGORY,
    categoryQueue: [],
    visitedCategories: categories,
    discoveredPages,
    completedCategoryTraversal: true,
  });

  console.log("Category traversal complete.");
  console.log(`Total animation categories: ${categories.length}`);
  console.log(`Total animation pages discovered: ${discoveredPages.length}\n`);

  return discoveredPages;
}

async function fetchBulbapediaPage(title) {
  const params = new URLSearchParams({
    action: "query",
    prop: "revisions|info",
    rvprop: "ids|timestamp|content",
    rvslots: "main",
    titles: title,
    format: "json",
    formatversion: "2",
  });

  const url = `${BULBAPEDIA_API_URL}?${params.toString()}`;
  const data = await fetchJson(url);

  const page = data?.query?.pages?.[0];

  if (!page || page.missing) {
    throw new Error(`Page not found: ${title}`);
  }

  const revision = page.revisions?.[0];
  const wikitext = revision?.slots?.main?.content ?? "";

  return {
    requestedTitle: title,
    resolvedTitle: page.title,
    pageId: page.pageid ?? null,
    revisionId: revision?.revid ?? null,
    parentRevisionId: revision?.parentid ?? null,
    revisionTimestamp: revision?.timestamp ?? null,
    fetchedAt: new Date().toISOString(),
    source: "Bulbapedia",
    sourceType: "MediaWiki API",
    canon: "anime",
    loreScope: "Category:Animation recursive crawl",
    wikitext,
  };
}

async function downloadAnimationPages(pages) {
  console.log("Downloading animation page wikitext...\n");

  const existingIndex = readJsonIfExists(INDEX_PATH, {
    rootCategory: ROOT_CATEGORY,
    totalPages: pages.length,
    pages,
  });

  const failedPages = readJsonIfExists(FAILED_PATH, []);

  let downloadedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const page of pages) {
    const fileName = safeFileNameFromPage(page.title, page.pageId);
    const outputPath = path.join(PAGES_DIR, fileName);

    if (fs.existsSync(outputPath)) {
      skippedCount += 1;
      continue;
    }

    try {
      console.log(`Downloading: ${page.title}`);

      const pageData = await fetchBulbapediaPage(page.title);

      const payload = {
        categorySource: page.sourceCategory,
        ...pageData,
      };

      writeJson(outputPath, payload);

      downloadedCount += 1;

      await sleep(PAGE_DOWNLOAD_DELAY_MS);
    } catch (error) {
      console.error(`Failed page: ${page.title}`);
      console.error(`Reason: ${error.message}\n`);

      failedPages.push({
        pageId: page.pageId,
        title: page.title,
        sourceCategory: page.sourceCategory,
        error: error.message,
        failedAt: new Date().toISOString(),
      });

      failedCount += 1;
      writeJson(FAILED_PATH, failedPages);

      await sleep(1000);
    }
  }

  writeJson(INDEX_PATH, {
    ...existingIndex,
    downloadedPageFilesDirectory: "pages",
    downloadStats: {
      downloadedThisRun: downloadedCount,
      skippedAlreadyExisting: skippedCount,
      failedThisRun: failedCount,
    },
    updatedAt: new Date().toISOString(),
  });

  console.log("\nAnimation page download pass complete.");
  console.log(`Downloaded this run: ${downloadedCount}`);
  console.log(`Skipped already existing: ${skippedCount}`);
  console.log(`Failed this run: ${failedCount}`);
}

async function runAnimationLoreDownload() {
  ensureFolders();

  console.log("Starting full Bulbapedia Animation lore crawl...\n");

  const discoveredPages = await crawlAnimationCategoryTree();
  await downloadAnimationPages(discoveredPages);

  console.log("\nFull Animation lore crawl finished.");
}

runAnimationLoreDownload().catch((error) => {
  console.error("\nAnimation lore download crashed:");
  console.error(error);
  process.exit(1);
});
