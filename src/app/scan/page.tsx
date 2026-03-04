"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ScanPage() {
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
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
        body: JSON.stringify({ repoUrl: repoUrl.trim(), branch: branch.trim() || "main" }),
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
      <div className="max-w-2xl">
        <h1 className="text-5xl md:text-7xl font-medium leading-[0.85] tracking-[-0.04em] mb-6">
          New Scan
        </h1>
        <p className="text-sm text-muted-foreground mb-12 max-w-md leading-relaxed">
          Paste a public GitHub repository URL to scan for security
          vulnerabilities and scalability issues.
        </p>

        <form onSubmit={handleScan} className="space-y-8">
          <div>
            <label className="text-[0.7rem] uppercase tracking-[0.05em] mb-2 block text-muted-foreground">
              Repository URL
            </label>
            <input
              type="url"
              placeholder="https://github.com/owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              required
              className="w-full bg-transparent border-0 border-b border-border font-mono text-lg py-3 focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50"
            />
          </div>

          <div>
            <label className="text-[0.7rem] uppercase tracking-[0.05em] mb-2 block text-muted-foreground">
              Branch
            </label>
            <input
              type="text"
              placeholder="main"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="w-full bg-transparent border-0 border-b border-border font-mono text-lg py-3 focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50 max-w-xs"
            />
          </div>

          {error && (
            <p className="text-sm text-vc-orange">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-foreground text-background border-0 px-8 py-3 font-mono text-sm uppercase tracking-[0.05em] cursor-pointer hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            {loading ? "Starting scan..." : "Start Security Scan"}
          </button>

          <p className="text-xs text-muted-foreground font-mono">
            The scan typically takes 1-3 minutes depending on repository size.
          </p>
        </form>
      </div>
    </div>
  );
}
