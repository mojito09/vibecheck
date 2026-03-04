import { readdir, stat } from "fs/promises";
import { join, extname } from "path";

const MAX_REPO_SIZE_MB = 200;
const MAX_FILE_COUNT = 50_000;
const MAX_SINGLE_FILE_MB = 10;

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg", ".webp", ".avif",
  ".mp3", ".mp4", ".wav", ".ogg", ".webm", ".avi", ".mov", ".flac",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar", ".tgz",
  ".jar", ".war", ".ear", ".class",
  ".exe", ".dll", ".so", ".dylib", ".bin", ".o", ".a",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".pyc", ".pyo", ".whl",
  ".min.js", ".min.css",
  ".map",
  ".sqlite", ".db",
  ".DS_Store",
]);

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out",
  "__pycache__", ".venv", "venv", "vendor", ".tox",
  "coverage", ".cache", ".turbo", ".parcel-cache",
  ".gradle", "target", "bin", "obj",
]);

export interface RepoGuardResult {
  totalFiles: number;
  totalSizeBytes: number;
  skippedBinaries: string[];
  oversizedFiles: string[];
  passed: boolean;
  failReason?: string;
}

function isBinary(filename: string): boolean {
  const ext = extname(filename).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return true;
  if (filename.endsWith(".min.js") || filename.endsWith(".min.css")) return true;
  return false;
}

export async function runRepoGuard(repoDir: string): Promise<RepoGuardResult> {
  let totalFiles = 0;
  let totalSizeBytes = 0;
  const skippedBinaries: string[] = [];
  const oversizedFiles: string[] = [];

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = fullPath.replace(repoDir + "/", "");

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(fullPath);
      } else if (entry.isFile()) {
        totalFiles++;

        if (totalFiles > MAX_FILE_COUNT) {
          return;
        }

        if (isBinary(entry.name)) {
          skippedBinaries.push(relativePath);
          continue;
        }

        try {
          const fileStat = await stat(fullPath);
          totalSizeBytes += fileStat.size;

          const fileSizeMB = fileStat.size / (1024 * 1024);
          if (fileSizeMB > MAX_SINGLE_FILE_MB) {
            oversizedFiles.push(relativePath);
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  await walk(repoDir);

  const totalSizeMB = totalSizeBytes / (1024 * 1024);

  if (totalFiles > MAX_FILE_COUNT) {
    return {
      totalFiles,
      totalSizeBytes,
      skippedBinaries,
      oversizedFiles,
      passed: false,
      failReason: `Repository exceeds maximum file count (${totalFiles.toLocaleString()} > ${MAX_FILE_COUNT.toLocaleString()} files). This may be a monorepo or contain generated code.`,
    };
  }

  if (totalSizeMB > MAX_REPO_SIZE_MB) {
    return {
      totalFiles,
      totalSizeBytes,
      skippedBinaries,
      oversizedFiles,
      passed: false,
      failReason: `Repository exceeds maximum size (${Math.round(totalSizeMB)}MB > ${MAX_REPO_SIZE_MB}MB). Consider scanning a subdirectory instead.`,
    };
  }

  return { totalFiles, totalSizeBytes, skippedBinaries, oversizedFiles, passed: true };
}
