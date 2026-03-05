"use client";

import { useEffect, useState, useCallback, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import { ScanProgress } from "@/components/scan-progress";
import { ChecklistCategory } from "@/components/checklist-category";
import { Switch } from "@/components/ui/switch";
import type { ScanResult, ScanStatus, Severity, FindingResult } from "@/types/scan";
import { SEVERITY_ORDER, CATEGORY_LABELS } from "@/types/scan";

interface ScanPageProps {
  params: Promise<{ id: string }>;
}

type FilterSeverity = "ALL" | Severity;

function getScoreColor(score: number): string {
  if (score >= 80) return "text-vc-green";
  if (score >= 60) return "text-yellow-600";
  if (score >= 40) return "text-vc-orange";
  return "text-red-600";
}

function extractRepoPath(url: string): string {
  try {
    return url.replace(/^https?:\/\//, "").replace(/\.git$/, "");
  } catch {
    return url;
  }
}

const DEDUCTION_MAP: Record<Severity, number> = {
  CRITICAL: 15, HIGH: 10, MEDIUM: 5, LOW: 2, INFO: 1,
};

function buildAllFixesPrompt(findings: FindingResult[], commitSha?: string, repoName?: string): string {
  const open = findings.filter((f) => f.status === "OPEN");
  if (open.length === 0) return "";

  const header = [
    repoName ? `Repository: ${repoName}` : "",
    commitSha ? `Commit: ${commitSha}` : "",
    `Fix the ${open.length} security/scalability issue${open.length !== 1 ? "s" : ""} described below with the smallest safe patches.`,
    "",
    "## Constraints",
    "- Do not add new dependencies unless absolutely necessary.",
    "- Preserve existing behavior and public APIs.",
    "- Add/adjust tests to cover exploits and fixes where possible.",
    "- Add input validation and safe defaults; fail closed.",
    "- Apply each fix as a minimal diff — do not refactor unrelated code.",
    "",
  ].filter(Boolean).join("\n");

  const issueBlocks = open.map((f, i) => {
    const parts = [
      `### Issue ${i + 1}: ${f.title}`,
      `**Severity:** ${f.severity} | **Category:** ${CATEGORY_LABELS[f.category] || f.category}`,
      `**File:** ${f.filePath}${f.lineStart ? `:${f.lineStart}` : ""}`,
      "",
      f.description,
    ];
    if (f.codeSnippet) parts.push("", "**Vulnerable code:**", "```", f.codeSnippet, "```");
    if (f.fixSuggestion) parts.push("", `**Fix:** ${f.fixSuggestion}`);
    if (f.fixCode) parts.push("", "**Suggested fix:**", "```", f.fixCode, "```");
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

function CursorLogo({ size = 16 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 130 146">
      <path fill="currentColor" d="M60.66 0h3.76c18.25 10.62 36.57 21.12 54.83 31.72 1.99 1.29 4.29 2.46 5.47 4.62.62 2.83.34 5.76.39 8.64-.04 18.65-.03 37.3 0 55.95-.04 1.91.03 3.86-.38 5.75-1.2 1.86-3.23 2.94-5.05 4.09-15.65 8.95-31.23 18.03-46.83 27.06-3.32 1.85-6.49 4.08-10.11 5.34-2.23-.32-4.17-1.6-6.12-2.63-15.81-9.32-31.8-18.32-47.62-27.62C5.85 111.16 2.79 109.23 0 106.93V36.1c3.83-3.78 8.81-5.98 13.34-8.77C29.1 18.19 44.82 8.98 60.66 0z" />
      <path fill="var(--background, #E2E2E2)" d="M5.62 38.04c4.45-.51 8.92-.02 13.37-.17 27.36-.02 54.71-.02 82.07 0 6.17.04 12.35-.22 18.51.27-.73 2.28-1.68 4.48-2.92 6.53C99.93 73.92 83.07 103.08 66.24 132.27c-.95 1.71-2.06 3.33-3.23 5.1-.29-1.73-.47-3.48-.47-5.24-.03-15.64.03-31.29 0-46.93-.05-4.57.31-9.18-.5-13.7-15.55-9.41-31.45-18.24-47-27.5-3.08-1.97-6.68-3.16-9.42-5.96z" />
    </svg>
  );
}

export default function ScanResultPage({ params }: ScanPageProps) {
  const { id } = use(params);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("Loading...");
  const [logEntries, setLogEntries] = useState<{ t: number; m: string }[]>([]);
  const [error, setError] = useState("");
  const [rescanning, setRescanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [devMode, setDevMode] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<FilterSeverity>("ALL");
  const [showFixed, setShowFixed] = useState(true);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const fetchResults = useCallback(async () => {
    const res = await fetch(`/api/scan/${id}`);
    if (!res.ok) {
      setError("Failed to load scan results");
      return;
    }
    const data = await res.json();
    setScan(data);
    setStatus(data.status);
    setProgress(data.progress);
    setMessage(data.progressMessage || "");
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchResults().then(() => {
      const eventSource = new EventSource(`/api/scan/${id}/stream`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.error) {
          setError(data.error);
          eventSource.close();
          return;
        }
        setStatus(data.status);
        setProgress(data.progress);
        setMessage(data.message || "");
        if (data.logs && data.logs.length > 0) {
          setLogEntries((prev) => [...prev, ...data.logs]);
        }

        if (data.status === "COMPLETED" || data.status === "FAILED") {
          eventSource.close();
          fetchResults();
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        fetchResults();
      };

      return () => eventSource.close();
    });
  }, [id, fetchResults]);

  async function handleRescan() {
    if (!scan) return;
    setRescanning(true);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: scan.repoUrl,
          parentScanId: scan.id,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        router.push(`/scan/${data.scanId}`);
      }
    } catch {
      setError("Failed to start re-scan");
    } finally {
      setRescanning(false);
    }
  }

  const filteredFindings = useMemo(() => {
    if (!scan) return [];
    return scan.findings.filter((f) => {
      if (severityFilter !== "ALL" && f.severity !== severityFilter) return false;
      if (!showFixed && (f.status === "FIXED" || f.status === "DISMISSED")) return false;
      return true;
    });
  }, [scan, severityFilter, showFixed]);

  const groupedFindings = useMemo(() => {
    const groups: Record<string, FindingResult[]> = {};
    for (const finding of filteredFindings) {
      if (!groups[finding.category]) groups[finding.category] = [];
      groups[finding.category].push(finding);
    }
    return Object.entries(groups).sort(([, a], [, b]) => {
      const aMax = Math.min(...a.map((f) => SEVERITY_ORDER[f.severity]));
      const bMax = Math.min(...b.map((f) => SEVERITY_ORDER[f.severity]));
      return aMax - bMax;
    });
  }, [filteredFindings]);

  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    if (!scan) return counts;
    for (const f of scan.findings) {
      if (f.status === "OPEN") counts[f.severity]++;
    }
    return counts;
  }, [scan]);

  const openCount = useMemo(() => {
    if (!scan) return 0;
    return scan.findings.filter((f) => f.status === "OPEN").length;
  }, [scan]);

  const potentialScore = useMemo(() => {
    if (!scan) return 0;
    let totalDeduction = 0;
    for (const f of scan.findings) {
      if (f.status !== "OPEN") continue;
      const weight = f.category === "vulnerable_deps" ? 0.3 : 1;
      totalDeduction += DEDUCTION_MAP[f.severity] * weight;
    }
    return Math.min(100, Math.round((scan.overallScore || 0) + totalDeduction));
  }, [scan]);

  const scoreGain = useMemo(() => {
    if (!scan) return 0;
    return potentialScore - (scan.overallScore || 0);
  }, [scan, potentialScore]);

  const allFixesPrompt = useMemo(() => {
    if (!scan) return "";
    return buildAllFixesPrompt(scan.findings, scan.commitSha, scan.repoName);
  }, [scan]);

  async function handleCopyAllFixes() {
    if (!allFixesPrompt) return;
    await navigator.clipboard.writeText(allFixesPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const isInProgress = status !== null && !["COMPLETED", "FAILED"].includes(status);
  const isCompleted = status === "COMPLETED";

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-3rem)] px-6 md:px-12 py-24 max-w-[1600px] mx-auto">
        <div className="text-center py-24 text-muted-foreground font-mono text-sm uppercase tracking-wider">
          Loading scan...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3rem)] px-6 md:px-12 py-8 md:py-12 max-w-[1600px] mx-auto">
      {/* Header */}
      <header className="relative border-b border-foreground pb-6 mb-8 md:mb-12">
        {scan?.summary && (
          <p className="text-xs text-muted-foreground leading-relaxed max-w-[360px] absolute top-0 right-0 hidden lg:block">
            {scan.summary}
          </p>
        )}

        <h1 className="text-5xl md:text-[7rem] font-medium leading-[0.85] tracking-[-0.04em] mb-8 md:mb-12">
          {scan?.repoName || "Scan"}
        </h1>

        <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-start md:items-end">
          <div className="flex-grow">
            <label className="text-[0.7rem] uppercase tracking-[0.05em] mb-2 block text-muted-foreground">
              Repository URL
            </label>
            <input
              type="text"
              value={scan ? extractRepoPath(scan.repoUrl) : ""}
              readOnly
              className="w-full bg-transparent border-0 border-b border-border font-mono text-base md:text-lg py-2 text-foreground cursor-default focus:outline-none"
            />
          </div>
          <div className="w-full md:max-w-[200px]">
            <label className="text-[0.7rem] uppercase tracking-[0.05em] mb-2 block text-muted-foreground">
              Branch
            </label>
            <input
              type="text"
              value={scan?.commitSha ? scan.commitSha.substring(0, 8) : "main"}
              readOnly
              className="w-full bg-transparent border-0 border-b border-border font-mono text-base md:text-lg py-2 text-foreground cursor-default focus:outline-none"
            />
          </div>
          <button
            onClick={isCompleted ? handleRescan : () => router.push("/scan")}
            disabled={rescanning}
            className="bg-foreground text-background border-0 px-6 py-2.5 font-mono text-sm uppercase tracking-[0.05em] cursor-pointer hover:opacity-80 transition-opacity disabled:opacity-50 whitespace-nowrap"
          >
            {rescanning ? "Starting..." : "New Scan"}
          </button>
          <div className="flex items-center gap-3 px-3 py-2 border border-border text-xs">
            <span className="font-mono uppercase tracking-wider">Dev Mode</span>
            <Switch
              checked={devMode}
              onCheckedChange={setDevMode}
              className="cursor-pointer"
            />
            <span className={`w-1.5 h-1.5 rounded-full ${devMode ? "bg-vc-green" : "bg-border"}`} />
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative mt-8">
          <span className="absolute right-0 -top-5 font-mono text-[0.65rem] text-vc-green uppercase tracking-wider">
            {isInProgress
              ? `${message} \u2022 ${progress}%`
              : isCompleted
                ? "Scan Complete \u2022 100%"
                : status === "FAILED"
                  ? "Scan Failed"
                  : ""}
          </span>
          <div className="w-full h-[2px] bg-border relative">
            <div
              className={`h-full transition-all duration-500 ${
                status === "FAILED" ? "bg-vc-orange" : "bg-vc-green"
              }`}
              style={{ width: `${isCompleted ? 100 : progress}%` }}
            />
          </div>
        </div>
      </header>

      {/* Error display */}
      {error && (
        <div className="border border-vc-orange/30 bg-vc-orange/5 px-4 py-3 mb-6">
          <p className="text-sm text-vc-orange">{error}</p>
        </div>
      )}

      {/* In-progress state */}
      {isInProgress && (
        <div className="max-w-3xl mx-auto py-12">
          <ScanProgress
            status={status}
            progress={progress}
            message={message}
            logs={logEntries}
          />
        </div>
      )}

      {/* Failed state */}
      {status === "FAILED" && (
        <div className="py-24 border border-dashed border-border text-center">
          <div className="text-3xl mb-4 text-vc-orange">&times;</div>
          <div className="text-xl font-light mb-2">Scan Failed</div>
          <p className="text-sm text-muted-foreground mb-6">{message}</p>
          <button
            onClick={() => router.push("/scan")}
            className="bg-foreground text-background px-6 py-2.5 font-mono text-sm uppercase tracking-[0.05em] cursor-pointer hover:opacity-80 transition-opacity"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Completed state */}
      {isCompleted && scan && (
        <div className="flex flex-col gap-8 md:gap-10">
          {/* Score + Fix Banner */}
          <div className="border-t-2 border-foreground pt-6">
            <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-10">
              {/* Score display */}
              <div className="shrink-0">
                <h3 className="text-[0.75rem] uppercase tracking-[0.05em] font-semibold flex items-center gap-2 mb-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${(scan.overallScore ?? 0) >= 80 ? "bg-vc-green" : (scan.overallScore ?? 0) >= 60 ? "bg-yellow-600" : "bg-vc-orange"}`} />
                  Security Score
                </h3>
                <div className={`text-6xl md:text-7xl font-light leading-none tracking-[-0.05em] ${getScoreColor(scan.overallScore ?? 0)}`}>
                  {scan.overallScore ?? 0}
                  <span className="text-xl text-muted-foreground">/100</span>
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  {severityCounts.CRITICAL} Critical &bull; {severityCounts.HIGH} High &bull;{" "}
                  {severityCounts.MEDIUM + severityCounts.LOW} Minor
                </div>
              </div>

              {/* Arrow + Potential score */}
              {openCount > 0 && scoreGain > 0 && (
                <>
                  <div className="hidden md:flex flex-col items-center gap-1 text-muted-foreground">
                    <span className="text-2xl">&rarr;</span>
                  </div>
                  <div className="shrink-0">
                    <h3 className="text-[0.75rem] uppercase tracking-[0.05em] font-semibold flex items-center gap-2 mb-2 text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-vc-green" />
                      After Fixes
                    </h3>
                    <div className="text-6xl md:text-7xl font-light leading-none tracking-[-0.05em] text-vc-green">
                      {potentialScore}
                      <span className="text-xl text-muted-foreground">/100</span>
                    </div>
                    <div className="text-xs text-vc-green mt-2 font-mono">
                      +{scoreGain} points if all {openCount} fix{openCount !== 1 ? "es" : ""} applied
                    </div>
                  </div>
                </>
              )}

              {/* Copy all fixes button */}
              {openCount > 0 && (
                <div className="md:ml-auto">
                  <button
                    onClick={handleCopyAllFixes}
                    className={`flex items-center gap-3 px-6 py-4 border-2 cursor-pointer transition-all ${
                      copied
                        ? "border-vc-green bg-vc-green/10"
                        : "border-foreground hover:bg-foreground hover:text-background"
                    }`}
                  >
                    <CursorLogo size={20} />
                    <div className="text-left">
                      <div className="font-mono text-sm uppercase tracking-wider font-medium">
                        {copied ? "Copied to clipboard!" : "Copy All Fixes"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {openCount} issue{openCount !== 1 ? "s" : ""} &bull; Paste into Cursor to fix
                      </div>
                    </div>
                  </button>
                </div>
              )}

              {/* Clean state */}
              {openCount === 0 && (
                <div className="md:ml-auto flex items-center gap-3 px-6 py-4 border border-vc-green/30 bg-vc-green/5">
                  <span className="text-2xl text-vc-green">&#10003;</span>
                  <div>
                    <div className="font-mono text-sm uppercase tracking-wider text-vc-green">All Clear</div>
                    <div className="text-xs text-muted-foreground mt-0.5">No open issues remaining</div>
                  </div>
                </div>
              )}
            </div>

            {/* Languages & Frameworks */}
            {scan.languages.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-border">
                {scan.languages.map((lang) => (
                  <span key={lang} className="font-mono text-xs px-2 py-1 border border-border capitalize">
                    {lang}
                  </span>
                ))}
                {scan.frameworks.map((fw) => (
                  <span key={fw} className="font-mono text-xs px-2 py-1 border border-border">
                    {fw}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Filter bar */}
          <div className="border-t-2 border-foreground">
            <div className="flex flex-wrap items-center gap-4 md:gap-6 py-3 border-b border-border mb-6 text-xs uppercase tracking-[0.05em]">
              {(["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((sev) => {
                const count = sev === "ALL"
                  ? scan.findings.filter((f) => f.status === "OPEN").length
                  : severityCounts[sev];
                const isActive = severityFilter === sev;
                return (
                  <button
                    key={sev}
                    onClick={() => setSeverityFilter(sev)}
                    className={`cursor-pointer transition-opacity pb-0.5 ${
                      isActive
                        ? "opacity-100 border-b border-vc-green"
                        : "opacity-40 hover:opacity-70"
                    }`}
                  >
                    {sev === "ALL" ? `All (${count})` : `${sev} (${count})`}
                  </button>
                );
              })}
              <button
                onClick={() => setShowFixed(!showFixed)}
                className="cursor-pointer opacity-40 hover:opacity-70 transition-opacity ml-auto text-xs font-mono"
              >
                {showFixed ? "HIDE FIXED" : "SHOW FIXED"}
              </button>
            </div>

            {/* Findings list or empty state */}
            {groupedFindings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 md:py-24 text-center border border-dashed border-border mt-4">
                <div className="text-4xl mb-6 text-vc-green">&#10003;</div>
                <div className="text-xl md:text-2xl font-light mb-2">
                  {scan.findings.length === 0
                    ? scan.languages.length === 0
                      ? "No Analyzable Code"
                      : "No Issues Found"
                    : severityFilter !== "ALL"
                      ? `No ${severityFilter} Findings`
                      : "No Critical Findings"}
                </div>
                <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                  {scan.findings.length === 0
                    ? scan.languages.length === 0
                      ? "No analyzable source code was found in this repository."
                      : "Your repository configuration and source code align with industry security standards. No immediate remediation required."
                    : "No findings match the current filters. Try adjusting the severity filter to see other results."}
                </p>
                <div className="mt-6 font-mono text-[0.7rem] text-vc-green tracking-wider">
                  {"// CLEAN VIBES DETECTED"}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {groupedFindings.map(([category, findings]) => (
                  <ChecklistCategory
                    key={category}
                    category={category}
                    findings={findings}
                    scanId={scan.id}
                    devMode={devMode}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
