import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { FindingData } from "@/types/scan";
import { createHash } from "crypto";

const SHA_PIN_REGEX = /^[a-f0-9]{40}$/;

interface ActionRef {
  raw: string;
  owner: string;
  repo: string;
  ref: string;
  line: number;
}

function parseUsesLine(line: string, lineNumber: number): ActionRef | null {
  const match = line.match(/uses:\s*["']?([^"'\s#]+)/);
  if (!match) return null;

  const raw = match[1];
  const actionMatch = raw.match(/^([^/]+)\/([^@]+)@(.+)$/);
  if (!actionMatch) return null;

  const [, owner, repo, ref] = actionMatch;
  if (owner === "." || owner === "..") return null;

  return { raw, owner, repo, ref, line: lineNumber };
}

function isPinnedToSha(ref: string): boolean {
  return SHA_PIN_REGEX.test(ref);
}

function generateFingerprint(file: string, action: string): string {
  const data = `actions:${file}:${action}`;
  return createHash("sha256").update(data).digest("hex").substring(0, 16);
}

export async function runGithubActionsCheck(repoDir: string): Promise<FindingData[]> {
  const workflowDir = join(repoDir, ".github", "workflows");
  const findings: FindingData[] = [];

  let entries;
  try {
    entries = await readdir(workflowDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const ymlFiles = entries
    .filter((e) => e.isFile() && (e.name.endsWith(".yml") || e.name.endsWith(".yaml")))
    .map((e) => e.name);

  for (const file of ymlFiles) {
    try {
      const content = await readFile(join(workflowDir, file), "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed.startsWith("- uses:") && !trimmed.startsWith("uses:")) continue;

        const action = parseUsesLine(trimmed, i + 1);
        if (!action) continue;

        if (!isPinnedToSha(action.ref)) {
          const relativePath = `.github/workflows/${file}`;
          findings.push({
            category: "unpinned_actions",
            severity: "MEDIUM",
            title: `Unpinned GitHub Action: ${action.owner}/${action.repo}@${action.ref}`,
            description: `The action ${action.raw} is pinned to a mutable tag ("${action.ref}") instead of a commit SHA. A compromised or hijacked tag could execute arbitrary code in your CI pipeline, potentially stealing secrets or injecting malicious code into builds.`,
            filePath: relativePath,
            lineStart: action.line,
            lineEnd: action.line,
            codeSnippet: trimmed,
            fixSuggestion: `Pin this action to a full commit SHA instead of a tag. Find the SHA for the "${action.ref}" tag at https://github.com/${action.owner}/${action.repo}/tags, then use: ${action.owner}/${action.repo}@<commit-sha> # ${action.ref}`,
            detectedBy: "actions-check",
            fingerprint: generateFingerprint(relativePath, action.raw),
          });
        }
      }
    } catch {
      // skip unreadable workflow files
    }
  }

  return findings;
}
