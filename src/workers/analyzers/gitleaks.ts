import { execFileSync } from "child_process";
import { FindingData, Severity } from "@/types/scan";
import { createHash } from "crypto";

interface GitleaksResult {
  RuleID: string;
  Description: string;
  File: string;
  StartLine: number;
  EndLine: number;
  Match: string;
  Secret: string;
  Entropy: number;
  Tags: string[];
}

function mapSeverity(ruleId: string): Severity {
  const critical = ["aws-access-key", "private-key", "github-pat", "gcp-service-account"];
  const high = ["generic-api-key", "slack-token", "stripe-api-key", "twilio-api-key"];

  if (critical.some((c) => ruleId.toLowerCase().includes(c))) return "CRITICAL";
  if (high.some((h) => ruleId.toLowerCase().includes(h))) return "HIGH";
  return "HIGH";
}

function generateFingerprint(result: GitleaksResult): string {
  const data = `secret:${result.RuleID}:${result.File}:${result.Match.substring(0, 50)}`;
  return createHash("sha256").update(data).digest("hex").substring(0, 16);
}

function redactSecret(secret: string): string {
  if (secret.length <= 8) return "****";
  return secret.substring(0, 4) + "****" + secret.substring(secret.length - 4);
}

export async function runGitleaks(repoDir: string): Promise<FindingData[]> {
  const args = [
    "detect",
    "--source", repoDir,
    "--report-format", "json",
    "--report-path", "/dev/stdout",
    "--no-git",
    "--exit-code", "0",
  ];

  try {
    const output = execFileSync("gitleaks", args, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 2 * 60 * 1000,
    });

    if (!output.trim()) return [];

    const results: GitleaksResult[] = JSON.parse(output);
    return results.map((result) => ({
      category: "hardcoded_secrets",
      severity: mapSeverity(result.RuleID),
      title: `Hardcoded ${result.Description}`,
      description: `Found a hardcoded ${result.Description} in ${result.File}. Secret value: ${redactSecret(result.Secret)}. Hardcoded secrets in source code can be extracted by anyone with access to the repository and should be moved to environment variables.`,
      filePath: result.File.replace(repoDir + "/", ""),
      lineStart: result.StartLine,
      lineEnd: result.EndLine,
      codeSnippet: result.Match,
      detectedBy: "gitleaks",
      fingerprint: generateFingerprint(result),
    }));
  } catch (error) {
    console.error("Gitleaks scan error:", error);
    return [];
  }
}
