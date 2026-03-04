"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATS = [
  { value: "2.74x", label: "More vulnerabilities in AI-generated code" },
  { value: "45%", label: "Of vibe-coded output has security flaws" },
  { value: "0/15", label: "AI-built apps implemented CSRF protection" },
  { value: "35", label: "Categories of issues detected" },
];

const FEATURES = [
  {
    title: "Static + AI Analysis",
    description:
      "Combines Semgrep static analysis with LLM-powered contextual review to catch both pattern-based and logic-level vulnerabilities.",
  },
  {
    title: "Copy-to-Cursor Prompts",
    description:
      "Every finding includes a ready-to-paste prompt for Cursor IDE. One click to copy, paste into Cursor, and let AI fix it for you.",
  },
  {
    title: "Security + Scalability",
    description:
      "Goes beyond security: detects N+1 queries, missing pagination, memory leaks, race conditions, and other scalability pitfalls.",
  },
  {
    title: "Re-scan & Track",
    description:
      "Fix issues, hit re-scan, and watch your checklist turn green. Track progress across multiple scans with fingerprint-based matching.",
  },
  {
    title: "35 Issue Categories",
    description:
      "Covers OWASP Top 10, hardcoded secrets, missing headers, broken auth, business logic flaws, dependency CVEs, and more.",
  },
  {
    title: "Multi-Language Support",
    description:
      "Supports JavaScript, TypeScript, Python, Ruby, Go, and Java. Automatically detects languages and applies the right rulesets.",
  },
];

export default function HomePage() {
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: repoUrl.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start scan");
        return;
      }

      router.push(`/scan/${data.scanId}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-3rem)] px-6 md:px-12 py-12 md:py-24 max-w-[1600px] mx-auto">
      <section className="relative pb-12 border-b border-foreground mb-12">
        <p className="text-xs text-muted-foreground leading-relaxed max-w-[360px] absolute top-0 right-0 hidden md:block">
          Automated security auditing pipeline integrating Semgrep, Gitleaks,
          and AI-powered review for vibe-coded projects.
        </p>

        <h1 className="text-6xl md:text-[8rem] font-medium leading-[0.85] tracking-[-0.04em] mb-12">
          VibeCheck
        </h1>

        <p className="text-muted-foreground text-sm md:text-base max-w-xl mb-10 leading-relaxed">
          AI-generated code ships 2.74x more vulnerabilities. Paste your GitHub
          repo and get an actionable security checklist with one-click Cursor
          fixes.
        </p>

        <form onSubmit={handleScan} className="flex flex-col sm:flex-row gap-4 items-end max-w-2xl">
          <div className="flex-grow w-full">
            <label className="text-[0.7rem] uppercase tracking-[0.05em] mb-2 block text-muted-foreground">
              Repository URL
            </label>
            <input
              type="url"
              placeholder="https://github.com/owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              required
              className="w-full bg-transparent border-0 border-b border-border font-mono text-base md:text-lg py-2 focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-foreground text-background border-0 px-6 py-2.5 font-mono text-sm uppercase tracking-[0.05em] cursor-pointer hover:opacity-80 transition-opacity disabled:opacity-50 whitespace-nowrap"
          >
            {loading ? "Starting..." : "Scan Repository"}
          </button>
        </form>

        {error && (
          <p className="text-sm text-vc-orange mt-3">{error}</p>
        )}
      </section>

      <section className="pb-12 border-b border-border mb-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
          {STATS.map((stat) => (
            <div key={stat.label}>
              <div className="text-3xl md:text-5xl font-light tracking-[-0.03em] mb-1">
                {stat.value}
              </div>
              <div className="text-xs text-muted-foreground leading-snug">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="pb-12">
        <h3 className="text-[0.8rem] uppercase tracking-[0.05em] font-semibold flex items-center gap-2 mb-8">
          <span className="w-1.5 h-1.5 bg-foreground rounded-full inline-block" />
          How it works
        </h3>

        <div className="border-t-2 border-foreground">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="py-5 border-b border-border group"
            >
              <div className="flex flex-col md:flex-row md:items-baseline gap-2 md:gap-8">
                <h4 className="font-medium text-sm md:w-64 shrink-0">
                  {feature.title}
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-foreground/20 pt-6 pb-4">
        <p className="text-xs text-muted-foreground font-mono">
          VibeCheck &mdash; Open source security scanner for vibe-coded projects.
        </p>
      </footer>
    </div>
  );
}
