import os from "node:os";
import fs from "node:fs";
import path from "node:path";

const MAX_FOLDER_ITEMS = 40;

const safeFolders = {
  project: process.cwd(),
  desktop: path.join(os.homedir(), "Desktop"),
  documents: path.join(os.homedir(), "Documents"),
  downloads: path.join(os.homedir(), "Downloads"),
};

function formatBytes(bytes = 0) {
  const gb = bytes / 1024 / 1024 / 1024;
  return `${gb.toFixed(2)} GB`;
}

function safeReadFolder(folderPath) {
  try {
    if (!fs.existsSync(folderPath)) {
      return {
        exists: false,
        path: folderPath,
        items: [],
      };
    }

    const items = fs
      .readdirSync(folderPath, { withFileTypes: true })
      .slice(0, MAX_FOLDER_ITEMS)
      .map((item) => ({
        name: item.name,
        type: item.isDirectory() ? "folder" : "file",
      }));

    return {
      exists: true,
      path: folderPath,
      items,
    };
  } catch (error) {
    return {
      exists: false,
      path: folderPath,
      error: error.message,
      items: [],
    };
  }
}

function shouldIncludeFolderListing(message = "") {
  const normalized = message.toLowerCase();

  return [
    "file",
    "files",
    "folder",
    "folders",
    "desktop",
    "documents",
    "downloads",
    "project",
    "directory",
    "where is",
    "what is in",
    "show me",
    "list",
  ].some((keyword) => normalized.includes(keyword));
}

export function buildLocalComputerContext(userMessage = "") {
  const now = new Date();
  const cpus = os.cpus() || [];
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;

  const baseSnapshot = {
    currentTime: {
      iso: now.toISOString(),
      local: now.toLocaleString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    computer: {
      hostname: os.hostname(),
      username: os.userInfo().username,
      platform: os.platform(),
      release: os.release(),
      architecture: os.arch(),
      uptimeSeconds: Math.floor(os.uptime()),
    },
    cpu: {
      model: cpus[0]?.model || "Unknown CPU",
      cores: cpus.length,
      loadAverage: os.loadavg(),
    },
    memory: {
      total: formatBytes(totalMemory),
      used: formatBytes(usedMemory),
      free: formatBytes(freeMemory),
    },
    safeFolders,
  };

  const includeFolders = shouldIncludeFolderListing(userMessage);

  const folderListings = includeFolders
    ? {
        project: safeReadFolder(safeFolders.project),
        desktop: safeReadFolder(safeFolders.desktop),
        documents: safeReadFolder(safeFolders.documents),
        downloads: safeReadFolder(safeFolders.downloads),
      }
    : null;

  return `
LOCAL COMPUTER CONTEXT

You have read-only access to this local computer context.
You do not have internet access.
You must not claim to access websites, APIs, online news, online prices, or live web data.
You may use only the local computer information below.

Current local time:
${baseSnapshot.currentTime.local}

Timezone:
${baseSnapshot.currentTime.timezone}

Computer:
- Hostname: ${baseSnapshot.computer.hostname}
- Username: ${baseSnapshot.computer.username}
- Platform: ${baseSnapshot.computer.platform}
- OS release: ${baseSnapshot.computer.release}
- Architecture: ${baseSnapshot.computer.architecture}
- Uptime seconds: ${baseSnapshot.computer.uptimeSeconds}

CPU:
- Model: ${baseSnapshot.cpu.model}
- Cores: ${baseSnapshot.cpu.cores}
- Load average: ${baseSnapshot.cpu.loadAverage.join(", ")}

Memory:
- Total: ${baseSnapshot.memory.total}
- Used: ${baseSnapshot.memory.used}
- Free: ${baseSnapshot.memory.free}

Allowed folders:
- Project: ${safeFolders.project}
- Desktop: ${safeFolders.desktop}
- Documents: ${safeFolders.documents}
- Downloads: ${safeFolders.downloads}

${
  folderListings
    ? `Requested folder listings:
${JSON.stringify(folderListings, null, 2)}`
    : "Folder listings were not included because the user did not ask about files or folders."
}

Rules:
- Be honest about what local data is available.
- Do not invent local files, folders, apps, or system information.
- Do not say you can browse the internet.
- Do not say you can modify the computer.
- If the user asks for something outside this context, say what local permission or tool would be needed.
`.trim();
}
