import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { FindingData, Severity } from "@/types/scan";
import { createHash } from "crypto";

interface SemgrepResult {
  results: SemgrepMatch[];
  errors: unknown[];
}

interface SemgrepMatch {
  check_id: string;
  path: string;
  start: { line: number; col: number };
  end: { line: number; col: number };
  extra: {
    message: string;
    severity: string;
    metadata?: {
      category?: string;
      cwe?: string[];
      owasp?: string[];
      confidence?: string;
    };
    lines: string;
  };
}

const SEMGREP_RULESETS = [
  "p/security-audit",
  "p/owasp-top-ten",
  "p/secrets",
];

const LANGUAGE_RULESETS: Record<string, string[]> = {
  javascript: ["p/javascript", "p/nodejs"],
  typescript: ["p/typescript"],
  python: ["p/python", "p/django", "p/flask"],
  ruby: ["p/ruby"],
  go: ["p/golang"],
  java: ["p/java"],
};

function mapSeverity(semgrepSeverity: string): Severity {
  switch (semgrepSeverity.toUpperCase()) {
    case "ERROR":
      return "CRITICAL";
    case "WARNING":
      return "HIGH";
    case "INFO":
      return "MEDIUM";
    default:
      return "LOW";
  }
}

function hasCwe(cweString: string, target: string): boolean {
  const pattern = new RegExp(`\\b${target}\\b`, "i");
  return pattern.test(cweString);
}

function mapCategory(checkId: string, metadata?: SemgrepMatch["extra"]["metadata"]): string {
  const id = checkId.toLowerCase();
  const cwe = (metadata?.cwe || []).join(",").toLowerCase();

  if (metadata?.category && id.includes("vibecheck")) return metadata.category;
  if (id.includes("secret") || id.includes("password") || id.includes("api-key") || id.includes("hardcoded") || hasCwe(cwe, "cwe-798")) return "hardcoded_secrets";
  if (id.includes("sql") || hasCwe(cwe, "cwe-89")) return "injection";
  if (id.includes("xss") || id.includes("cross-site") || hasCwe(cwe, "cwe-79")) return "xss";
  if (id.includes("ssrf") || hasCwe(cwe, "cwe-918")) return "ssrf";
  if (id.includes("csrf") || hasCwe(cwe, "cwe-352")) return "csrf";
  if (id.includes("command") || id.includes("exec") || id.includes("os-command") || id.includes("child-process") || hasCwe(cwe, "cwe-78")) return "command_injection";
  if (id.includes("path-traversal") || id.includes("traversal") || id.includes("directory") || hasCwe(cwe, "cwe-22")) return "path_traversal";
  if (id.includes("deseriali") || hasCwe(cwe, "cwe-502")) return "insecure_deserialization";
  if (id.includes("redirect") || hasCwe(cwe, "cwe-601")) return "open_redirect";
  if (id.includes("input") || id.includes("valid")) return "input_validation";
  if (id.includes("auth") || id.includes("jwt")) return "broken_auth";
  if (id.includes("header") || id.includes("cors") || id.includes("csp")) return "security_headers";
  if (id.includes("log")) return "log_injection";
  if (id.includes("upload") || id.includes("file")) return "file_upload";
  if (id.includes("tls") || id.includes("ssl") || id.includes("http") || hasCwe(cwe, "cwe-319")) return "insecure_transport";

  return "input_validation";
}

function generateFingerprint(match: SemgrepMatch): string {
  const data = `${match.check_id}:${match.path}:${match.extra.lines.trim().substring(0, 200)}`;
  return createHash("sha256").update(data).digest("hex").substring(0, 16);
}

export async function runSemgrep(
  repoDir: string,
  languages: string[]
): Promise<FindingData[]> {
  const rulesets = [...SEMGREP_RULESETS];

  for (const lang of languages) {
    const langRules = LANGUAGE_RULESETS[lang];
    if (langRules) rulesets.push(...langRules);
  }

  const args = [
    "scan",
    "--json",
    "--quiet",
    "--no-git-ignore",
    "--max-target-bytes=1000000",
    "--timeout=60",
  ];

  for (const ruleset of rulesets) {
    args.push("--config", ruleset);
  }

  const customRulesPath = join(process.cwd(), "semgrep-rules");
  if (existsSync(customRulesPath)) {
    args.push("--config", customRulesPath);
  }

  args.push(repoDir);

  try {
    const output = execFileSync("semgrep", args, {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
    });

    const result: SemgrepResult = JSON.parse(output);
    return result.results.map((match) => ({
      category: mapCategory(match.check_id, match.extra.metadata),
      severity: mapSeverity(match.extra.severity),
      title: match.check_id.split(".").pop()?.replace(/-/g, " ") || match.check_id,
      description: match.extra.message,
      filePath: match.path.replace(repoDir + "/", ""),
      lineStart: match.start.line,
      lineEnd: match.end.line,
      codeSnippet: match.extra.lines,
      detectedBy: "semgrep",
      fingerprint: generateFingerprint(match),
    }));
  } catch (error: unknown) {
    const err = error as { stdout?: string; status?: number };
    if (err.stdout) {
      try {
        const result: SemgrepResult = JSON.parse(err.stdout);
        return result.results.map((match) => ({
          category: mapCategory(match.check_id, match.extra.metadata),
          severity: mapSeverity(match.extra.severity),
          title: match.check_id.split(".").pop()?.replace(/-/g, " ") || match.check_id,
          description: match.extra.message,
          filePath: match.path.replace(repoDir + "/", ""),
          lineStart: match.start.line,
          lineEnd: match.end.line,
          codeSnippet: match.extra.lines,
          detectedBy: "semgrep",
          fingerprint: generateFingerprint(match),
        }));
      } catch {
        // JSON parse of stdout failed
      }
    }
    console.error("Semgrep scan error:", err.status);
    return [];
  }
}
