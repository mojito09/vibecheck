"use client";

import { useEffect, useRef, useState } from "react";

interface ScanProgressProps {
  status: string;
  progress: number;
  message: string;
}

const STATUS_STEPS = [
  { key: "QUEUED", label: "Queued" },
  { key: "CLONING", label: "Cloning repository" },
  { key: "DETECTING", label: "Detecting languages" },
  { key: "ANALYZING", label: "Static analysis" },
  { key: "SCANNING_SECRETS", label: "Secret detection" },
  { key: "SCANNING_DEPS", label: "Dependency audit" },
  { key: "AI_REVIEW", label: "AI review" },
  { key: "GENERATING_REPORT", label: "Generating report" },
];

function formatEta(seconds: number): string {
  if (seconds < 10) return "a few seconds";
  if (seconds < 60) return `~${Math.round(seconds / 5) * 5}s`;
  const mins = Math.round(seconds / 60);
  return `~${mins} min${mins !== 1 ? "s" : ""}`;
}

function useEta(progress: number): string | null {
  const startRef = useRef<{ time: number; progress: number } | null>(null);
  const [eta, setEta] = useState<string | null>(null);

  useEffect(() => {
    if (progress <= 0 || progress >= 100) {
      startRef.current = null;
      setEta(null);
      return;
    }

    if (!startRef.current) {
      startRef.current = { time: Date.now(), progress };
      return;
    }

    const elapsed = (Date.now() - startRef.current.time) / 1000;
    const progressMade = progress - startRef.current.progress;

    if (elapsed < 3 || progressMade <= 0) return;

    const rate = progressMade / elapsed;
    const remaining = (100 - progress) / rate;

    setEta(formatEta(Math.max(0, remaining)));
  }, [progress]);

  return eta;
}

export function ScanProgress({ status, progress, message }: ScanProgressProps) {
  const currentIndex = STATUS_STEPS.findIndex((s) => s.key === status);
  const eta = useEta(progress);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        {STATUS_STEPS.map((step, index) => {
          const isActive = step.key === status;
          const isDone = index < currentIndex;

          return (
            <div key={step.key} className="flex items-center gap-3 py-2">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  isDone
                    ? "bg-vc-green"
                    : isActive
                      ? "bg-foreground animate-pulse"
                      : "bg-border"
                }`}
              />
              <span
                className={`text-sm font-mono ${
                  isDone
                    ? "text-vc-green"
                    : isActive
                      ? "text-foreground font-medium"
                      : "text-muted-foreground/50"
                }`}
              >
                {step.label}
              </span>
              {isDone && (
                <span className="text-vc-green text-xs ml-auto">&#10003;</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
