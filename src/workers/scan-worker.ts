import "dotenv/config";
import { Worker, Job, connection } from "@/lib/queue";
import type { ScanJobData } from "@/lib/queue";
import { prisma } from "@/lib/db";
import { execFileSync } from "child_process";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { detectLanguagesAndFrameworks } from "./analyzers/language-detector";
import { runSemgrep } from "./analyzers/semgrep";
import { runGitleaks } from "./analyzers/gitleaks";
import { runDependencyAudit } from "./analyzers/dependency-audit";
import { runAIReview } from "./analyzers/ai-reviewer";
import { runRepoGuard } from "./analyzers/repo-guard";
import { runGithubActionsCheck } from "./analyzers/github-actions";
import { FindingData, Severity, SEVERITY_ORDER } from "@/types/scan";
import { pushLogMessage, clearLogMessages } from "@/lib/scan-logs";

async function updateProgress(scanId: string, status: string, progress: number, message: string) {
  await prisma.scan.update({
    where: { id: scanId },
    data: {
      status: status as never,
      progress,
      progressMessage: message,
    },
  });
}

async function log(scanId: string, message: string) {
  await pushLogMessage(scanId, message);
}

function calculateScore(findings: FindingData[]): number {
  if (findings.length === 0) return 100;

  let deductions = 0;
  for (const finding of findings) {
    const isDep = finding.category === "vulnerable_deps";
    const weight = isDep ? 0.3 : 1;
    switch (finding.severity) {
      case "CRITICAL": deductions += 15 * weight; break;
      case "HIGH": deductions += 10 * weight; break;
      case "MEDIUM": deductions += 5 * weight; break;
      case "LOW": deductions += 2 * weight; break;
      case "INFO": deductions += 1 * weight; break;
    }
  }

  return Math.max(0, Math.min(100, Math.round(100 - deductions)));
}

function generateSummary(findings: FindingData[], languages: string[], frameworks: string[]): string {
  if (languages.length === 0) {
    return "No analyzable source code found in this repository.";
  }

  const counts: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  for (const f of findings) counts[f.severity]++;

  const parts: string[] = [];
  parts.push(`Scanned a ${languages.join("/")} project${frameworks.length ? ` using ${frameworks.join(", ")}` : ""}.`);
  parts.push(`Found ${findings.length} issue${findings.length !== 1 ? "s" : ""}: ${counts.CRITICAL} critical, ${counts.HIGH} high, ${counts.MEDIUM} medium, ${counts.LOW} low.`);

  const categories = new Set(findings.map((f) => f.category));
  if (categories.size > 0) {
    parts.push(`Issues span ${categories.size} categor${categories.size !== 1 ? "ies" : "y"}.`);
  }

  if (counts.CRITICAL > 0) {
    parts.push("Immediate attention required for critical issues.");
  }

  return parts.join(" ");
}

function generateCursorPrompts(finding: FindingData, commitSha?: string): { short: string; detailed: string } {
  const location = finding.lineStart ? `${finding.filePath}:${finding.lineStart}` : finding.filePath;

  const short = `Fix the ${finding.title.toLowerCase()} in ${location}. ${finding.fixSuggestion || ""}`.trim();

  const detailed = [
    commitSha ? `You are editing this repository at commit ${commitSha}.` : "",
    `Fix the vulnerability described below with the smallest safe patch.`,
    ``,
    `## Constraints`,
    `- Do not add new dependencies unless absolutely necessary.`,
    `- Preserve existing behavior and public APIs.`,
    `- Add/adjust tests to cover the exploit and the fix.`,
    `- Add input validation and safe defaults; fail closed.`,
    ``,
    `## Security Issue: ${finding.title}`,
    ``,
    `**File:** ${finding.filePath}${finding.lineStart ? `:${finding.lineStart}` : ""}`,
    `**Severity:** ${finding.severity}`,
    `**Category:** ${finding.category}`,
    ``,
    `### Problem`,
    finding.description,
    ``,
    finding.codeSnippet ? `### Vulnerable Code\n\`\`\`\n${finding.codeSnippet}\n\`\`\`` : "",
    ``,
    `### How to Fix`,
    finding.fixSuggestion || "Review and apply security best practices.",
    ``,
    finding.fixCode ? `### Suggested Fix\n\`\`\`\n${finding.fixCode}\n\`\`\`` : "",
    ``,
    `## Verification`,
    `After making the fix, verify that:`,
    `1. The vulnerability is no longer present (re-run the security scan).`,
    `2. Existing tests still pass.`,
    `3. The fix handles edge cases (empty input, null values, boundary conditions).`,
    finding.category === "injection" ? `4. All user inputs are parameterized / escaped before reaching the sink.` : "",
    finding.category === "xss" ? `4. All dynamic content is properly escaped or rendered through safe APIs.` : "",
    finding.category === "hardcoded_secrets" ? `4. The secret has been rotated in the provider's dashboard.` : "",
  ].filter(Boolean).join("\n");

  return { short, detailed };
}

const PLAIN_LANGUAGE: Record<string, { title: string; description: (f: FindingData) => string }> = {
  injection: {
    title: "Attackers could steal or corrupt your database",
    description: (f) => `A flaw in ${f.filePath} could let an attacker run their own commands against your database. They could steal user data, delete records, or even take over your system.`,
  },
  xss: {
    title: "Hackers could inject harmful content into your pages",
    description: (f) => `Unsafe content handling in ${f.filePath} means an attacker could inject scripts that steal your users' login sessions, personal data, or redirect them to fake websites.`,
  },
  ssrf: {
    title: "Your server could be tricked into accessing private systems",
    description: (f) => `A flaw in ${f.filePath} could let attackers make your server reach internal systems or services it shouldn't, potentially exposing sensitive data or infrastructure.`,
  },
  csrf: {
    title: "Someone could trick your users into unwanted actions",
    description: (f) => `Without proper protection in ${f.filePath}, an attacker could create a fake page that makes your users unknowingly submit requests — like changing their password or making a purchase.`,
  },
  security_headers: {
    title: "Your app is missing important safety shields",
    description: (f) => `The file ${f.filePath} doesn't set up browser safety features that protect your users from attacks like clickjacking, content injection, and data theft.`,
  },
  hardcoded_secrets: {
    title: "A password or secret key is exposed in your code",
    description: (f) => `A secret was found in ${f.filePath} that's visible to anyone who can see your code. If this is a real key, attackers could use it to access your services, rack up charges, or steal data.`,
  },
  broken_auth: {
    title: "Users might access things they shouldn't",
    description: (f) => `A flaw in ${f.filePath} means the app doesn't properly check who's allowed to do what. Users could view, change, or delete data that belongs to other people.`,
  },
  business_logic: {
    title: "Your app's rules could be tricked or bypassed",
    description: (f) => `A logic flaw in ${f.filePath} means attackers could manipulate the system — for example, getting items for free, bypassing limits, or exploiting pricing errors.`,
  },
  log_injection: {
    title: "Attackers could fake your app's activity logs",
    description: (f) => `A flaw in ${f.filePath} lets attackers inject fake entries into your logs, making it harder to detect real attacks and potentially misleading investigations.`,
  },
  input_validation: {
    title: "Your app doesn't check if user input is safe",
    description: (f) => `The code in ${f.filePath} accepts user input without proper checks, which could lead to crashes, data corruption, or security breaches.`,
  },
  insecure_api: {
    title: "Your app uses outdated or unsafe methods",
    description: (f) => `The code in ${f.filePath} uses methods that are known to be insecure or deprecated. This leaves your app vulnerable to attacks that have well-known fixes.`,
  },
  rate_limiting: {
    title: "Your app can be overwhelmed with too many requests",
    description: (f) => `The endpoint in ${f.filePath} has no limit on how fast it can be called. Attackers could flood it to crash your app, brute-force passwords, or scrape all your data.`,
  },
  command_injection: {
    title: "Attackers could run harmful commands through your app",
    description: (f) => `A flaw in ${f.filePath} could let attackers execute system commands on your server — potentially deleting files, installing malware, or taking full control.`,
  },
  path_traversal: {
    title: "Attackers could access files they shouldn't see",
    description: (f) => `A flaw in ${f.filePath} could let attackers navigate your server's file system and read sensitive files like configuration, passwords, or private data.`,
  },
  insecure_deserialization: {
    title: "Harmful data could be disguised as safe",
    description: (f) => `The code in ${f.filePath} processes incoming data in a way that could let attackers sneak in malicious code disguised as normal data, potentially taking over your server.`,
  },
  file_upload: {
    title: "Dangerous files could be uploaded to your app",
    description: (f) => `The upload handling in ${f.filePath} doesn't properly check what's being uploaded. Attackers could upload malicious files that execute code on your server.`,
  },
  exposed_config: {
    title: "Sensitive settings are accessible to the public",
    description: (f) => `Configuration in ${f.filePath} exposes sensitive details like database credentials or API keys that should be kept private.`,
  },
  insecure_transport: {
    title: "Data is being sent without encryption",
    description: (f) => `The code in ${f.filePath} sends data without encryption, meaning anyone on the network could intercept and read sensitive information like passwords and personal data.`,
  },
  weak_auth: {
    title: "Login security is too easy to bypass",
    description: (f) => `The authentication in ${f.filePath} has weaknesses that could let attackers guess passwords, hijack sessions, or bypass login entirely.`,
  },
  idor: {
    title: "Users could access other people's private data",
    description: (f) => `A flaw in ${f.filePath} lets users access other people's data just by changing a number in the URL. There's no check to verify they own that data.`,
  },
  mass_assignment: {
    title: "Users could modify data they shouldn't have access to",
    description: (f) => `The code in ${f.filePath} blindly accepts all incoming data fields, meaning attackers could modify things like their own permissions, prices, or other users' data.`,
  },
  open_redirect: {
    title: "Your app could send users to malicious websites",
    description: (f) => `A flaw in ${f.filePath} could let attackers craft links that look like they go to your site but actually redirect users to phishing pages or malware.`,
  },
  vulnerable_deps: {
    title: "You're using a component with known security flaws",
    description: (f) => `One of the building blocks your app depends on (listed in ${f.filePath}) has a publicly known security vulnerability. Attackers actively look for apps using these.`,
  },
  missing_lockfile: {
    title: "Your app's building blocks aren't locked down",
    description: (f) => `Without a lockfile, every time your app is set up, it might pull in different versions of its building blocks — including ones that have been tampered with or contain security flaws.`,
  },
  unpinned_deps: {
    title: "A building block version can change without your knowledge",
    description: (f) => `The dependency in ${f.filePath} is set to accept any version. If someone publishes a malicious update, your app will automatically use it the next time it's set up.`,
  },
  unpinned_actions: {
    title: "Your automated workflow could be tampered with",
    description: (f) => `A step in your CI/CD pipeline (${f.filePath}) references a version that can be changed by the author. If their account is compromised, your builds could be hijacked.`,
  },
  error_handling: {
    title: "Error messages reveal sensitive information",
    description: (f) => `When something goes wrong in ${f.filePath}, the error messages shown could reveal internal details about your system that help attackers plan their approach.`,
  },
  n_plus_one: {
    title: "This page will get slower and slower as you get more data",
    description: (f) => `The code in ${f.filePath} makes a separate database request for each item, so a page showing 100 items makes 100+ database calls. As your data grows, this will make your app noticeably slow.`,
  },
  missing_pagination: {
    title: "Your app tries to load everything at once",
    description: (f) => `The code in ${f.filePath} loads all records from the database at once instead of in small batches. With enough data, this will crash your app or make it unresponsive.`,
  },
  missing_caching: {
    title: "Your app re-fetches data it already has",
    description: (f) => `The code in ${f.filePath} doesn't save frequently-used data for quick access, meaning it re-fetches the same data repeatedly — making your app slower and more expensive to run.`,
  },
  memory_leak: {
    title: "Your app slowly eats up more memory over time",
    description: (f) => `The code in ${f.filePath} holds onto resources it no longer needs. Over time, this causes your app to use more and more memory until it crashes or becomes very slow.`,
  },
  race_condition: {
    title: "Simultaneous users could cause data conflicts",
    description: (f) => `The code in ${f.filePath} doesn't handle multiple users doing things at the same time. This could lead to corrupted data, duplicate transactions, or inconsistent state.`,
  },
  unhandled_errors: {
    title: "Your app doesn't handle failures gracefully",
    description: (f) => `The code in ${f.filePath} doesn't properly handle situations where things go wrong (like network failures or bad data). This could cause your app to crash or show broken pages.`,
  },
  missing_indexes: {
    title: "Your database searches are slower than they should be",
    description: (f) => `The database queries in ${f.filePath} search through data without proper indexes. As your data grows, these searches will get exponentially slower.`,
  },
  missing_connection_pool: {
    title: "Your database connections aren't being reused efficiently",
    description: (f) => `The code in ${f.filePath} creates new database connections for each request instead of reusing them. Under heavy traffic, this can exhaust your database and crash your app.`,
  },
  blocking_operations: {
    title: "Your app freezes while waiting for slow tasks",
    description: (f) => `The code in ${f.filePath} blocks everything while waiting for a slow operation to complete. During that time, no other users can be served — making your app feel frozen.`,
  },
  missing_timeout: {
    title: "Your app could hang forever waiting for a response",
    description: (f) => `The code in ${f.filePath} makes requests without setting a time limit. If the other service goes down, your app will wait indefinitely, eventually becoming unresponsive.`,
  },
  unbounded_fetch: {
    title: "Your app tries to load unlimited amounts of data",
    description: (f) => `The code in ${f.filePath} fetches data without any limit. With enough records, this will overwhelm your app's memory and cause it to crash.`,
  },
};

function generatePlainLanguage(finding: FindingData): { plainTitle: string; plainDescription: string } {
  const entry = PLAIN_LANGUAGE[finding.category];
  if (entry) {
    return {
      plainTitle: entry.title,
      plainDescription: entry.description(finding),
    };
  }

  return {
    plainTitle: `A potential issue was found in your app`,
    plainDescription: `An issue was detected in ${finding.filePath} that could affect your app's security or performance. Review the technical details to understand the specific impact.`,
  };
}

async function reconcileWithPreviousScan(scanId: string, findings: FindingData[]): Promise<void> {
  const scan = await prisma.scan.findUnique({ where: { id: scanId }, select: { parentScanId: true } });
  if (!scan?.parentScanId) return;

  const previousFindings = await prisma.finding.findMany({
    where: { scanId: scan.parentScanId },
    select: { fingerprint: true },
  });

  const previousFingerprints = new Set(previousFindings.map((f) => f.fingerprint));
  const currentFingerprints = new Set(findings.map((f) => f.fingerprint));

  const resolvedFingerprints = [...previousFingerprints].filter((fp) => !currentFingerprints.has(fp));

  if (resolvedFingerprints.length > 0) {
    await prisma.finding.updateMany({
      where: {
        scanId: scan.parentScanId,
        fingerprint: { in: resolvedFingerprints },
      },
      data: { status: "FIXED" },
    });
  }
}

function resolveDefaultBranch(repoUrl: string, requestedBranch: string): string {
  if (requestedBranch && requestedBranch !== "main") return requestedBranch;

  try {
    const output = execFileSync("git", ["ls-remote", "--symref", repoUrl, "HEAD"], {
      encoding: "utf-8",
      timeout: 15000,
    });
    const match = output.match(/ref: refs\/heads\/(\S+)\s+HEAD/);
    if (match) return match[1];
  } catch {
    // fall through to defaults
  }

  return requestedBranch || "main";
}

async function processScan(job: Job<ScanJobData>) {
  const { scanId, repoUrl, branch: requestedBranch, accessToken, scanMode = "quick" } = job.data;
  let repoDir: string | null = null;
  const isDeepScan = scanMode === "deep";

  try {
    await clearLogMessages(scanId);

    await prisma.scan.update({
      where: { id: scanId },
      data: { status: "CLONING", startedAt: new Date(), progress: 5, progressMessage: "Cloning repository..." },
    });
    await log(scanId, "Initializing scan environment...");

    repoDir = await mkdtemp(join(tmpdir(), "vibecheck-"));

    const cloneUrl = accessToken
      ? repoUrl.replace("https://", `https://x-access-token:${accessToken}@`)
      : repoUrl;

    await log(scanId, "Resolving default branch...");
    const branch = resolveDefaultBranch(cloneUrl, requestedBranch);
    await log(scanId, `Cloning branch "${branch}" (shallow clone)...`);

    execFileSync("git", ["clone", "--depth=1", "--branch", branch, cloneUrl, repoDir], {
      timeout: 2 * 60 * 1000,
    });

    let commitSha: string | undefined;
    try {
      commitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf-8" }).trim();
    } catch {
      // non-critical
    }

    if (commitSha) {
      await prisma.scan.update({ where: { id: scanId }, data: { commitSha } });
      await log(scanId, `Repository cloned at commit ${commitSha.substring(0, 8)}`);
    }

    // --- Repo validation ---
    await updateProgress(scanId, "DETECTING", 10, "Validating repository...");
    await log(scanId, "Validating repository size and structure...");
    const guardResult = await runRepoGuard(repoDir);
    if (!guardResult.passed) {
      await log(scanId, `Validation failed: ${guardResult.failReason}`);
      await prisma.scan.update({
        where: { id: scanId },
        data: {
          status: "FAILED",
          progress: 0,
          progressMessage: guardResult.failReason || "Repository exceeds size limits.",
          completedAt: new Date(),
        },
      });
      return;
    }

    const sizeMB = Math.round(guardResult.totalSizeBytes / 1024 / 1024);
    await log(scanId, `Repository validated — ${sizeMB}MB analyzable`);
    if (guardResult.skippedBinaries.length > 0) {
      await log(scanId, `Skipped ${guardResult.skippedBinaries.length} binary files`);
    }

    // --- Language detection ---
    await updateProgress(scanId, "DETECTING", 15, "Detecting languages and frameworks...");
    await log(scanId, "Scanning file extensions and config files...");
    const { languages, frameworks } = await detectLanguagesAndFrameworks(repoDir);

    await prisma.scan.update({
      where: { id: scanId },
      data: { languages, frameworks },
    });
    await log(scanId, `Detected: ${languages.join(", ") || "no languages"}${frameworks.length ? ` (${frameworks.join(", ")})` : ""}`);

    // --- Parallel analysis phase ---
    // Progress range: 20-70% for quick mode, 20-55% for deep mode
    const parallelStart = 20;
    const parallelEnd = isDeepScan ? 55 : 75;
    const parallelRange = parallelEnd - parallelStart;

    await updateProgress(scanId, "ANALYZING", parallelStart, "Running parallel analysis...");
    await log(scanId, "Starting parallel analyzers...");

    const analyzerNames = ["Semgrep", "Gitleaks", "Dependencies", "CI/CD"];
    const totalAnalyzers = analyzerNames.length;
    let completedAnalyzers = 0;

    const updateParallelProgress = async (analyzerName: string, findingCount: number) => {
      completedAnalyzers++;
      const pct = Math.round(parallelStart + (completedAnalyzers / totalAnalyzers) * parallelRange);
      const statusKey = completedAnalyzers <= 2 ? "ANALYZING" : "SCANNING_DEPS";
      await log(scanId, `${analyzerName} complete — ${findingCount} issue${findingCount !== 1 ? "s" : ""} found`);
      await updateProgress(scanId, statusKey, pct, `${analyzerName} complete (${completedAnalyzers}/${totalAnalyzers})...`);
    };

    await log(scanId, "  → Semgrep: static analysis across OWASP rulesets");
    await log(scanId, "  → Gitleaks: scanning for hardcoded secrets");
    await log(scanId, "  → Dependency audit: checking for known CVEs");
    await log(scanId, "  → CI/CD: reviewing GitHub Actions security");

    const [semgrepFindings, secretFindings, depFindings, actionsFindings] = await Promise.all([
      runSemgrep(repoDir, languages).then(async (r) => { await updateParallelProgress("Semgrep static analysis", r.length); return r; }),
      runGitleaks(repoDir).then(async (r) => { await updateParallelProgress("Secret detection", r.length); return r; }),
      runDependencyAudit(repoDir, languages).then(async (r) => { await updateParallelProgress("Dependency audit", r.length); return r; }),
      runGithubActionsCheck(repoDir).then(async (r) => { await updateParallelProgress("CI/CD pipeline check", r.length); return r; }),
    ]);

    const staticFindings = [...semgrepFindings, ...secretFindings, ...depFindings, ...actionsFindings];
    await log(scanId, `Parallel analysis complete — ${staticFindings.length} total issues from static tools`);

    // --- AI Review (deep mode only) ---
    let aiFindings: FindingData[] = [];
    if (isDeepScan) {
      await updateProgress(scanId, "AI_REVIEW", 60, "Running AI-powered contextual review...");
      await log(scanId, "Starting AI-powered deep review with Gemini...");
      await log(scanId, "Preparing code context for LLM analysis...");
      aiFindings = await runAIReview(repoDir, staticFindings, languages, frameworks, secretFindings);
      await log(scanId, `AI review complete — ${aiFindings.length} additional insight${aiFindings.length !== 1 ? "s" : ""} found`);
    } else {
      await log(scanId, "Quick scan mode — skipping AI review");
    }

    const allFindings = deduplicateFindings([...staticFindings, ...aiFindings]);
    await log(scanId, `${allFindings.length} unique findings after deduplication`);

    for (const finding of allFindings) {
      if (!finding.cursorPromptShort || !finding.cursorPromptDetailed) {
        const prompts = generateCursorPrompts(finding, commitSha);
        finding.cursorPromptShort = finding.cursorPromptShort || prompts.short;
        finding.cursorPromptDetailed = finding.cursorPromptDetailed || prompts.detailed;
      }
      if (!finding.plainTitle || !finding.plainDescription) {
        const plain = generatePlainLanguage(finding);
        finding.plainTitle = finding.plainTitle || plain.plainTitle;
        finding.plainDescription = finding.plainDescription || plain.plainDescription;
      }
    }

    // --- Report generation ---
    const reportProgress = isDeepScan ? 85 : 80;
    await updateProgress(scanId, "GENERATING_REPORT", reportProgress, "Generating report...");
    await log(scanId, "Generating Cursor fix prompts for each finding...");
    await log(scanId, "Computing security score...");

    const score = calculateScore(allFindings);
    const summary = generateSummary(allFindings, languages, frameworks);

    await log(scanId, "Persisting findings to database...");
    await prisma.finding.createMany({
      data: allFindings.map((f) => ({
        scanId,
        category: f.category,
        severity: f.severity as never,
        title: f.title,
        description: f.description,
        filePath: f.filePath,
        lineStart: f.lineStart,
        lineEnd: f.lineEnd,
        codeSnippet: f.codeSnippet,
        fixSuggestion: f.fixSuggestion,
        fixCode: f.fixCode,
        plainTitle: f.plainTitle,
        plainDescription: f.plainDescription,
        cursorPromptShort: f.cursorPromptShort,
        cursorPromptDetailed: f.cursorPromptDetailed,
        detectedBy: f.detectedBy,
        fingerprint: f.fingerprint,
        status: "OPEN" as never,
      })),
    });

    await reconcileWithPreviousScan(scanId, allFindings);
    await log(scanId, `Scan complete! Score: ${score}/100 with ${allFindings.length} findings`);

    await prisma.scan.update({
      where: { id: scanId },
      data: {
        status: "COMPLETED",
        progress: 100,
        progressMessage: "Scan complete!",
        overallScore: score,
        summary,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    console.error(`Scan ${scanId} failed:`, error);

    let userMessage = "An unexpected error occurred during scanning.";
    if (error instanceof Error) {
      const msg = error.message.slice(0, 500);
      if (msg.includes("ENOENT") && msg.includes("git")) {
        userMessage = "Git is not installed on the server. Please contact the administrator.";
      } else if (msg.includes("Remote branch") && msg.includes("not found")) {
        userMessage = `Branch not found. The repository may use a different default branch. Try specifying the branch (e.g. "master") on the scan form.`;
      } else if (msg.includes("Repository not found") || msg.includes("fatal: repository")) {
        userMessage = "Repository not found. Check the URL and ensure the repo is public (or sign in for private repos).";
      } else if (msg.includes("ETIMEDOUT") || (msg.includes("SIGTERM") && msg.includes("timed out"))) {
        userMessage = "Clone timed out. The repository may be too large or the network connection is slow.";
      } else {
        console.error("Unhandled scan error detail:", msg);
        userMessage = "Scan failed due to an internal error. Please try again.";
      }
    }

    await log(scanId, `Error: ${userMessage}`);
    await prisma.scan.update({
      where: { id: scanId },
      data: {
        status: "FAILED",
        progress: 0,
        progressMessage: userMessage,
        completedAt: new Date(),
      },
    });
  } finally {
    if (repoDir) {
      await rm(repoDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function deduplicateFindings(findings: FindingData[]): FindingData[] {
  const seen = new Map<string, FindingData>();
  for (const finding of findings) {
    const existing = seen.get(finding.fingerprint);
    if (!existing || SEVERITY_ORDER[finding.severity] < SEVERITY_ORDER[existing.severity]) {
      seen.set(finding.fingerprint, finding);
    }
  }
  return Array.from(seen.values());
}

function checkTools() {
  const required = ["git"];
  const optional = ["semgrep", "gitleaks"];
  for (const tool of required) {
    try {
      execFileSync("which", [tool], { encoding: "utf-8" });
      console.log(`  ✓ ${tool}`);
    } catch {
      console.error(`  ✗ ${tool} (REQUIRED - scans will fail)`);
    }
  }
  for (const tool of optional) {
    try {
      execFileSync("which", [tool], { encoding: "utf-8" });
      console.log(`  ✓ ${tool}`);
    } catch {
      console.log(`  - ${tool} (not found, skipping)`);
    }
  }
}

console.log("Checking available tools:");
checkTools();

const worker = new Worker<ScanJobData>("scan", processScan, {
  connection,
  concurrency: 2,
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
  lockDuration: 5 * 60 * 1000,
  stalledInterval: 2 * 60 * 1000,
});

worker.on("completed", (job) => {
  console.log(`Scan job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`Scan job ${job?.id} failed:`, err.message);
});

console.log("Scan worker started, waiting for jobs...");
