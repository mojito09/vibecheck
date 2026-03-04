"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ScanSummary {
  id: string;
  repoName: string;
  repoUrl: string;
  status: string;
  overallScore: number | null;
  createdAt: string;
  completedAt: string | null;
  _count?: { findings: number };
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "JUST NOW";
  if (minutes < 60) return `${minutes}M AGO`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}H AGO`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "YESTERDAY";
  if (days < 7) return `${days}D AGO`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
}

function getScoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 80) return "text-vc-green";
  if (score >= 60) return "text-yellow-600";
  if (score >= 40) return "text-vc-orange";
  return "text-red-600";
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "COMPLETED": return "DONE";
    case "FAILED": return "FAILED";
    default: return "SCANNING";
  }
}

export default function DashboardPage() {
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/scans")
      .then((r) => r.json())
      .then((data) => setScans(data.scans || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-[calc(100vh-3rem)] px-6 md:px-12 py-12 md:py-24 max-w-[1600px] mx-auto">
      <div className="flex items-baseline justify-between mb-12">
        <h1 className="text-5xl md:text-7xl font-medium leading-[0.85] tracking-[-0.04em]">
          Dashboard
        </h1>
        <Link
          href="/scan"
          className="bg-foreground text-background px-6 py-2.5 font-mono text-sm uppercase tracking-[0.05em] hover:opacity-80 transition-opacity"
        >
          New Scan
        </Link>
      </div>

      {loading ? (
        <div className="py-24 text-center text-muted-foreground text-sm font-mono uppercase tracking-wider">
          Loading...
        </div>
      ) : scans.length === 0 ? (
        <div className="py-24 border border-dashed border-border text-center">
          <p className="text-muted-foreground text-sm mb-6">No scans yet.</p>
          <Link
            href="/scan"
            className="bg-foreground text-background px-6 py-2.5 font-mono text-sm uppercase tracking-[0.05em] hover:opacity-80 transition-opacity inline-block"
          >
            Run Your First Scan
          </Link>
        </div>
      ) : (
        <div>
          <h3 className="text-[0.8rem] uppercase tracking-[0.05em] font-semibold flex items-center gap-2 mb-4">
            <span className="w-1.5 h-1.5 bg-foreground rounded-full inline-block" />
            Scan History
          </h3>
          <div className="border-t-2 border-foreground">
            {scans.map((scan) => (
              <Link key={scan.id} href={`/scan/${scan.id}`} className="block">
                <div className="py-4 border-b border-border flex items-center justify-between hover:bg-card/50 transition-colors px-1 cursor-pointer">
                  <div className="flex items-center gap-4">
                    <span className={`w-1.5 h-1.5 rounded-full inline-block ${
                      scan.status === "COMPLETED" ? "bg-vc-green" :
                      scan.status === "FAILED" ? "bg-vc-orange" :
                      "bg-foreground animate-pulse"
                    }`} />
                    <div>
                      <span className="text-sm font-medium">{scan.repoName}</span>
                      {scan._count && (
                        <span className="text-xs text-muted-foreground ml-3">
                          {scan._count.findings} findings
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    {scan.overallScore !== null && (
                      <span className={`text-2xl font-light tracking-tight ${getScoreColor(scan.overallScore)}`}>
                        {scan.overallScore}
                      </span>
                    )}
                    <div className="text-right">
                      <span className="font-mono text-xs text-muted-foreground block">
                        {formatRelativeTime(scan.createdAt)}
                      </span>
                      <span className={`font-mono text-[0.65rem] uppercase tracking-wider ${
                        scan.status === "COMPLETED" ? "text-vc-green" :
                        scan.status === "FAILED" ? "text-vc-orange" :
                        "text-muted-foreground"
                      }`}>
                        {getStatusLabel(scan.status)}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
