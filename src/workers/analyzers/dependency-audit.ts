import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { FindingData, Severity } from "@/types/scan";
import { createHash } from "crypto";

interface NpmAdvisory {
  source: number;
  name: string;
  title: string;
  url: string;
  severity: string;
  range: string;
}

interface NpmAuditVuln {
  name: string;
  severity: string;
  range: string;
  via: (NpmAdvisory | string)[];
  effects: string[];
  isDirect: boolean;
  fixAvailable: boolean | { name: string; version: string };
}

function extractAdvisoryInfo(vuln: NpmAuditVuln): { title: string; url: string } {
  for (const v of vuln.via) {
    if (typeof v === "object" && v.title) {
      return { title: v.title, url: v.url || "" };
    }
  }
  return { title: `Known vulnerability in ${vuln.name}`, url: "" };
}

function mapNpmSeverity(severity: string): Severity {
  switch (severity) {
    case "critical": return "CRITICAL";
    case "high": return "HIGH";
    case "moderate": return "MEDIUM";
    case "low": return "LOW";
    default: return "INFO";
  }
}

function generateFingerprint(pkg: string, title: string): string {
  const data = `dep:${pkg}:${title}`;
  return createHash("sha256").update(data).digest("hex").substring(0, 16);
}

type JsPackageManager = "npm" | "pnpm" | "yarn" | null;

function detectJsPackageManager(repoDir: string): JsPackageManager {
  if (existsSync(join(repoDir, "package-lock.json"))) return "npm";
  if (existsSync(join(repoDir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(repoDir, "yarn.lock"))) return "yarn";
  return null;
}

async function runNpmAudit(repoDir: string): Promise<FindingData[]> {
  const pm = detectJsPackageManager(repoDir);
  if (!pm) {
    const pkgFile = await readFile(join(repoDir, "package.json"), "utf-8").catch(() => null);
    if (!pkgFile) return [];
    return [];
  }

  const cmd = pm === "npm" ? "npm" : pm === "pnpm" ? "pnpm" : "yarn";
  const args = pm === "yarn"
    ? ["audit", "--json"]
    : ["audit", "--json", "--omit=dev"];

  try {
    const output = execFileSync(cmd, args, {
      cwd: repoDir,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 60 * 1000,
    });

    const result = JSON.parse(output);
    const vulnerabilities = result.vulnerabilities || {};

    return Object.entries(vulnerabilities)
      .filter(([, vuln]) => {
        const v = vuln as NpmAuditVuln;
        return v.via.some((entry) => typeof entry === "object");
      })
      .map(([name, vuln]) => {
        const v = vuln as NpmAuditVuln;
        const { title, url } = extractAdvisoryInfo(v);
        const fixInfo = typeof v.fixAvailable === "object"
          ? `Update to ${v.fixAvailable.name}@${v.fixAvailable.version}`
          : v.fixAvailable ? "Fix available via npm audit fix" : "No automatic fix available";

        return {
          category: "vulnerable_deps",
          severity: mapNpmSeverity(v.severity),
          title: `Vulnerable dependency: ${name} - ${title}`,
          description: `${title}. Affected range: ${v.range}.${url ? ` More info: ${url}` : ""}`,
          filePath: "package.json",
          detectedBy: "npm-audit",
          fingerprint: generateFingerprint(name, title),
          fixSuggestion: fixInfo,
        };
      });
  } catch (error: unknown) {
    const err = error as { stdout?: string };
    if (err.stdout) {
      try {
        const result = JSON.parse(err.stdout);
        const vulnerabilities = result.vulnerabilities || {};
        return Object.entries(vulnerabilities)
          .filter(([, vuln]) => {
            const v = vuln as NpmAuditVuln;
            return v.via.some((entry) => typeof entry === "object");
          })
          .map(([name, vuln]) => {
            const v = vuln as NpmAuditVuln;
            const { title, url } = extractAdvisoryInfo(v);
            const fixInfo = typeof v.fixAvailable === "object"
              ? `Update to ${v.fixAvailable.name}@${v.fixAvailable.version}`
              : v.fixAvailable ? "Fix available via npm audit fix" : "No automatic fix available";
            return {
              category: "vulnerable_deps",
              severity: mapNpmSeverity(v.severity),
              title: `Vulnerable dependency: ${name} - ${title}`,
              description: `${title}. Affected range: ${v.range}.${url ? ` More info: ${url}` : ""}`,
              filePath: "package.json",
              detectedBy: "npm-audit",
              fingerprint: generateFingerprint(name, title),
              fixSuggestion: fixInfo,
            };
          });
      } catch {
        // parse failed
      }
    }
    return [];
  }
}

async function runPipAudit(repoDir: string): Promise<FindingData[]> {
  try {
    const reqFile = await readFile(join(repoDir, "requirements.txt"), "utf-8").catch(() => null);
    if (!reqFile) return [];

    const output = execFileSync("pip-audit", ["-r", join(repoDir, "requirements.txt"), "--format=json", "--progress-spinner=off"], {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 2 * 60 * 1000,
    });

    const results = JSON.parse(output);
    return (results.dependencies || [])
      .filter((dep: { vulns: unknown[] }) => dep.vulns && dep.vulns.length > 0)
      .flatMap((dep: { name: string; version: string; vulns: { id: string; description: string; fix_versions: string[] }[] }) =>
        dep.vulns.map((vuln) => ({
          category: "vulnerable_deps",
          severity: "HIGH" as Severity,
          title: `Vulnerable dependency: ${dep.name}@${dep.version} - ${vuln.id}`,
          description: vuln.description,
          filePath: "requirements.txt",
          detectedBy: "pip-audit",
          fingerprint: generateFingerprint(dep.name, vuln.id),
          fixSuggestion: vuln.fix_versions?.length
            ? `Update to version ${vuln.fix_versions.join(" or ")}`
            : "No fix available yet",
        }))
      );
  } catch {
    return [];
  }
}

function checkMissingLockfile(repoDir: string, languages: string[]): FindingData[] {
  const findings: FindingData[] = [];

  if (languages.includes("javascript") || languages.includes("typescript")) {
    const hasPackageJson = existsSync(join(repoDir, "package.json"));
    const pm = detectJsPackageManager(repoDir);

    if (hasPackageJson && !pm) {
      findings.push({
        category: "missing_lockfile",
        severity: "HIGH",
        title: "Missing JavaScript lockfile",
        description: "This project has a package.json but no lockfile (package-lock.json, pnpm-lock.yaml, or yarn.lock). Without a lockfile, dependency versions are non-deterministic — different installs can pull different versions, risking supply-chain attacks and breaking changes. An attacker who compromises a dependency can silently push a malicious minor/patch version that gets installed automatically.",
        filePath: "package.json",
        detectedBy: "dep-audit",
        fingerprint: generateFingerprint("lockfile", "missing-js-lockfile"),
        fixSuggestion: "Run `npm install` (or pnpm/yarn equivalent) to generate a lockfile, then commit it to the repository. Never add lockfiles to .gitignore.",
      });
    }
  }

  if (languages.includes("python")) {
    const hasRequirements = existsSync(join(repoDir, "requirements.txt"));
    const hasPipfile = existsSync(join(repoDir, "Pipfile"));
    const hasPyproject = existsSync(join(repoDir, "pyproject.toml"));
    const hasPipfileLock = existsSync(join(repoDir, "Pipfile.lock"));
    const hasPoetryLock = existsSync(join(repoDir, "poetry.lock"));

    if ((hasRequirements || hasPipfile || hasPyproject) && !hasPipfileLock && !hasPoetryLock) {
      findings.push({
        category: "missing_lockfile",
        severity: "MEDIUM",
        title: "Missing Python lockfile",
        description: "This Python project has dependency manifests but no lockfile (Pipfile.lock or poetry.lock). Without a lockfile, builds are non-reproducible and vulnerable to supply-chain attacks through unpinned transitive dependencies.",
        filePath: hasRequirements ? "requirements.txt" : hasPipfile ? "Pipfile" : "pyproject.toml",
        detectedBy: "dep-audit",
        fingerprint: generateFingerprint("lockfile", "missing-py-lockfile"),
        fixSuggestion: "Use pipenv or poetry to generate a lockfile (e.g. `pipenv lock` or `poetry lock`), then commit it. If using requirements.txt, pin exact versions with `==` for all dependencies.",
      });
    }
  }

  return findings;
}

async function checkWildcardVersions(repoDir: string): Promise<FindingData[]> {
  const findings: FindingData[] = [];

  try {
    const content = await readFile(join(repoDir, "package.json"), "utf-8");
    const pkg = JSON.parse(content);
    const lines = content.split("\n");

    const depSections: Record<string, Record<string, string>> = {};
    if (pkg.dependencies) depSections.dependencies = pkg.dependencies;
    if (pkg.devDependencies) depSections.devDependencies = pkg.devDependencies;

    for (const [section, deps] of Object.entries(depSections)) {
      for (const [name, version] of Object.entries(deps)) {
        const isWildcard = version === "*" || version === "latest" || version === "x" || version === "";

        if (isWildcard) {
          const lineNum = lines.findIndex((l) => l.includes(`"${name}"`) && l.includes(`"${version}"`)) + 1;
          findings.push({
            category: "unpinned_deps",
            severity: "HIGH",
            title: `Wildcard dependency version: ${name}@"${version}"`,
            description: `The package "${name}" in ${section} uses "${version}" as its version specifier. This accepts ANY version including potentially malicious ones. An attacker who publishes a compromised version of this package will automatically be included in your next install. This is especially dangerous for AI-generated projects where LLMs may hallucinate package names that attackers register (slopsquatting).`,
            filePath: "package.json",
            lineStart: lineNum || undefined,
            lineEnd: lineNum || undefined,
            codeSnippet: `"${name}": "${version}"`,
            detectedBy: "dep-audit",
            fingerprint: generateFingerprint(name, `wildcard-${version}`),
            fixSuggestion: `Pin to a specific version range. Run \`npm show ${name} version\` to find the latest version, then use a caret range like "^x.y.z" instead of "${version}".`,
          });
        }
      }
    }
  } catch {
    // no package.json or parse error
  }

  return findings;
}

export async function runDependencyAudit(repoDir: string, languages: string[]): Promise<FindingData[]> {
  const findings: FindingData[] = [];

  findings.push(...checkMissingLockfile(repoDir, languages));

  if (languages.includes("javascript") || languages.includes("typescript")) {
    findings.push(...await runNpmAudit(repoDir));
    findings.push(...await checkWildcardVersions(repoDir));
  }

  if (languages.includes("python")) {
    findings.push(...await runPipAudit(repoDir));
  }

  return findings;
}
