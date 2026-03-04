"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { FindingResult, Severity } from "@/types/scan";
import { CATEGORY_LABELS } from "@/types/scan";

interface BatchPromptCopyProps {
  findings: FindingResult[];
  severity: Severity | "ALL_CRITICAL";
  commitSha?: string;
  repoName?: string;
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="14" height="14" x="8" y="8" rx="0" ry="0" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CursorLogo({ size = 14 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 130 146">
      <path fill="currentColor" d="M60.66 0h3.76c18.25 10.62 36.57 21.12 54.83 31.72 1.99 1.29 4.29 2.46 5.47 4.62.62 2.83.34 5.76.39 8.64-.04 18.65-.03 37.3 0 55.95-.04 1.91.03 3.86-.38 5.75-1.2 1.86-3.23 2.94-5.05 4.09-15.65 8.95-31.23 18.03-46.83 27.06-3.32 1.85-6.49 4.08-10.11 5.34-2.23-.32-4.17-1.6-6.12-2.63-15.81-9.32-31.8-18.32-47.62-27.62C5.85 111.16 2.79 109.23 0 106.93V36.1c3.83-3.78 8.81-5.98 13.34-8.77C29.1 18.19 44.82 8.98 60.66 0z" />
      <path fill="var(--background, #E2E2E2)" d="M5.62 38.04c4.45-.51 8.92-.02 13.37-.17 27.36-.02 54.71-.02 82.07 0 6.17.04 12.35-.22 18.51.27-.73 2.28-1.68 4.48-2.92 6.53C99.93 73.92 83.07 103.08 66.24 132.27c-.95 1.71-2.06 3.33-3.23 5.1-.29-1.73-.47-3.48-.47-5.24-.03-15.64.03-31.29 0-46.93-.05-4.57.31-9.18-.5-13.7-15.55-9.41-31.45-18.24-47-27.5-3.08-1.97-6.68-3.16-9.42-5.96z" />
    </svg>
  );
}

function getFilteredFindings(findings: FindingResult[], severity: Severity | "ALL_CRITICAL"): FindingResult[] {
  const open = findings.filter((f) => f.status === "OPEN");
  if (severity === "ALL_CRITICAL") {
    return open.filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH");
  }
  return open.filter((f) => f.severity === severity);
}

function buildBatchPrompt(findings: FindingResult[], commitSha?: string, repoName?: string): string {
  const header = [
    repoName ? `Repository: ${repoName}` : "",
    commitSha ? `Commit: ${commitSha}` : "",
    `Fix the ${findings.length} security/scalability issue${findings.length !== 1 ? "s" : ""} described below with the smallest safe patches.`,
    "",
    "## Constraints",
    "- Do not add new dependencies unless absolutely necessary.",
    "- Preserve existing behavior and public APIs.",
    "- Add/adjust tests to cover exploits and fixes where possible.",
    "- Add input validation and safe defaults; fail closed.",
    "- Apply each fix as a minimal diff — do not refactor unrelated code.",
    "",
  ].filter(Boolean).join("\n");

  const issueBlocks = findings.map((f, i) => {
    const parts = [
      `### Issue ${i + 1}: ${f.title}`,
      `**Severity:** ${f.severity} | **Category:** ${CATEGORY_LABELS[f.category] || f.category}`,
      `**File:** ${f.filePath}${f.lineStart ? `:${f.lineStart}` : ""}`,
      "",
      f.description,
    ];

    if (f.codeSnippet) {
      parts.push("", "**Vulnerable code:**", "```", f.codeSnippet, "```");
    }
    if (f.fixSuggestion) {
      parts.push("", `**Fix:** ${f.fixSuggestion}`);
    }
    if (f.fixCode) {
      parts.push("", "**Suggested fix:**", "```", f.fixCode, "```");
    }

    return parts.join("\n");
  });

  const footer = [
    "",
    "## Verification",
    "After making all fixes:",
    "1. Ensure all existing tests still pass.",
    "2. Verify each vulnerability is resolved.",
    "3. Re-run the security scan to confirm.",
  ].join("\n");

  return header + issueBlocks.join("\n\n---\n\n") + footer;
}

const SEVERITY_STYLES: Record<string, string> = {
  ALL_CRITICAL: "border-red-600 text-red-700 hover:bg-red-600/10",
  CRITICAL: "border-red-600 text-red-700 hover:bg-red-600/10",
  HIGH: "border-orange-600 text-orange-700 hover:bg-orange-600/10",
  MEDIUM: "border-yellow-600 text-yellow-700 hover:bg-yellow-600/10",
  LOW: "border-blue-600 text-blue-700 hover:bg-blue-600/10",
};

const SEVERITY_LABELS: Record<string, string> = {
  ALL_CRITICAL: "Fix All Critical + High",
  CRITICAL: "Fix All Critical",
  HIGH: "Fix All High",
  MEDIUM: "Fix All Medium",
  LOW: "Fix All Low",
};

export function BatchPromptCopy({ findings, severity, commitSha, repoName }: BatchPromptCopyProps) {
  const [copied, setCopied] = useState(false);

  const filtered = getFilteredFindings(findings, severity);
  if (filtered.length === 0) return null;

  const prompt = buildBatchPrompt(filtered, commitSha, repoName);

  async function handleCopy() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`text-xs gap-1.5 cursor-pointer font-mono uppercase tracking-wider w-full justify-start ${SEVERITY_STYLES[severity] || ""}`}
        >
          <CursorLogo />
          {SEVERITY_LABELS[severity]} ({filtered.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 font-mono text-sm uppercase tracking-wider">
              <CursorLogo size={18} />
              {SEVERITY_LABELS[severity]} &mdash; {filtered.length} issue{filtered.length !== 1 ? "s" : ""}
            </DialogTitle>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5 cursor-pointer font-mono"
              onClick={handleCopy}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? "Copied!" : "Copy Prompt"}
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <pre className="bg-card border border-border p-3 text-sm whitespace-pre-wrap font-mono">
            {prompt}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}
