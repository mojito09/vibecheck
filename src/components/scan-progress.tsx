"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface LogEntry {
  t: number;
  m: string;
}

interface ScanProgressProps {
  status: string;
  progress: number;
  message: string;
  logs?: LogEntry[];
}

const SCAN_STEPS = [
  { key: "QUEUED", label: "Queued", icon: "○" },
  { key: "CLONING", label: "Cloning repository", icon: "↓" },
  { key: "DETECTING", label: "Detecting languages", icon: "◎" },
  { key: "ANALYZING", label: "Running analyzers", icon: "⟐" },
  { key: "SCANNING_DEPS", label: "Scanning dependencies", icon: "◈" },
  { key: "AI_REVIEW", label: "AI deep review", icon: "◇" },
  { key: "GENERATING_REPORT", label: "Generating report", icon: "◆" },
];

function formatEta(seconds: number): string {
  if (seconds < 10) return "a few seconds";
  if (seconds < 60) return `~${Math.round(seconds / 5) * 5}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 1) return `~${secs}s`;
  return `~${mins}m ${secs > 0 ? `${secs}s` : ""}`.trim();
}

function useEta(progress: number): string | null {
  const samplesRef = useRef<{ time: number; progress: number }[]>([]);
  const [eta, setEta] = useState<string | null>(null);

  useEffect(() => {
    if (progress <= 0 || progress >= 100) {
      samplesRef.current = [];
      setEta(null);
      return;
    }

    samplesRef.current.push({ time: Date.now(), progress });
    if (samplesRef.current.length > 20) {
      samplesRef.current = samplesRef.current.slice(-20);
    }

    const samples = samplesRef.current;
    if (samples.length < 2) return;

    const first = samples[0];
    const elapsed = (Date.now() - first.time) / 1000;
    const progressMade = progress - first.progress;

    if (elapsed < 2 || progressMade <= 0) return;

    const rate = progressMade / elapsed;
    const remaining = (100 - progress) / rate;

    setEta(formatEta(Math.max(0, remaining)));
  }, [progress]);

  return eta;
}

function useElapsed(active: boolean): string {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!active) return;
    startRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [active]);

  if (elapsed < 60) return `${elapsed}s`;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return `${mins}m ${secs}s`;
}

function ScanningAnimation({ progress }: { progress: number }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [particles, setParticles] = useState<{ id: number; x: number; delay: number; speed: number }[]>([]);

  useEffect(() => {
    const count = 12;
    setParticles(
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 3,
        speed: 1 + Math.random() * 2,
      }))
    );
  }, []);

  return (
    <div ref={canvasRef} className="relative h-16 w-full overflow-hidden border border-border/50">
      {/* Scan line */}
      <div
        className="absolute top-0 h-full w-[2px] bg-vc-green/80 transition-all duration-1000 ease-out"
        style={{ left: `${progress}%` }}
      >
        <div className="absolute top-0 left-0 h-full w-8 bg-gradient-to-r from-vc-green/20 to-transparent" />
      </div>

      {/* Scanned region */}
      <div
        className="absolute top-0 left-0 h-full bg-vc-green/5 transition-all duration-1000 ease-out"
        style={{ width: `${progress}%` }}
      />

      {/* Particles representing files being scanned */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute w-1 h-1 bg-foreground/20"
          style={{
            left: `${p.x}%`,
            animation: `scanParticle ${p.speed}s ${p.delay}s infinite ease-in-out`,
          }}
        />
      ))}

      {/* Grid lines */}
      {Array.from({ length: 10 }, (_, i) => (
        <div
          key={i}
          className="absolute top-0 h-full w-px bg-border/30"
          style={{ left: `${(i + 1) * 10}%` }}
        />
      ))}

      {/* Horizontal grid */}
      <div className="absolute top-1/3 left-0 w-full h-px bg-border/20" />
      <div className="absolute top-2/3 left-0 w-full h-px bg-border/20" />
    </div>
  );
}

function LogFeed({ logs }: { logs: LogEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAutoScrollRef = useRef(true);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    isAutoScrollRef.current = atBottom;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && isAutoScrollRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs]);

  if (logs.length === 0) {
    return (
      <div className="h-40 border border-border/50 bg-foreground/[0.02] flex items-center justify-center">
        <span className="text-xs text-muted-foreground/50 font-mono animate-pulse">
          Waiting for scan output...
        </span>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="h-40 overflow-y-auto border border-border/50 bg-foreground/[0.02] font-mono text-[0.7rem] leading-relaxed scrollbar-thin"
    >
      {logs.map((entry, i) => {
        const time = new Date(entry.t);
        const ts = time.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const isResult = entry.m.includes("complete") || entry.m.includes("Detected");
        const isError = entry.m.startsWith("Error");
        const isArrow = entry.m.startsWith("  →");

        return (
          <div
            key={`${entry.t}-${i}`}
            className={`px-3 py-0.5 border-b border-border/10 flex gap-3 ${
              isError ? "text-vc-orange" : isResult ? "text-vc-green" : isArrow ? "text-muted-foreground/70" : "text-foreground/80"
            }`}
          >
            <span className="text-muted-foreground/40 shrink-0 select-none">{ts}</span>
            <span className="break-all">{entry.m}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ScanProgress({ status, progress, message, logs = [] }: ScanProgressProps) {
  const currentIndex = SCAN_STEPS.findIndex((s) => s.key === status);
  const eta = useEta(progress);
  const elapsed = useElapsed(progress > 0 && progress < 100);

  return (
    <div className="space-y-6">
      {/* Top stats bar */}
      <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider">
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">
            Deep Scan
          </span>
          <span className="text-foreground/30">|</span>
          <span className="text-muted-foreground">
            Elapsed: <span className="text-foreground">{elapsed}</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          {eta && (
            <span className="text-muted-foreground">
              ETA: <span className="text-vc-green">{eta}</span>
            </span>
          )}
          <span className="text-vc-green font-medium">{progress}%</span>
        </div>
      </div>

      {/* Scanning animation */}
      <ScanningAnimation progress={progress} />

      {/* Current status message */}
      {message && (
        <div className="text-xs font-mono text-muted-foreground truncate">
          {message}
        </div>
      )}

      {/* Steps */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        {SCAN_STEPS.map((step, index) => {
          const isActive = step.key === status;
          const isDone = index < currentIndex;
          const isPending = index > currentIndex;

          return (
            <div key={step.key} className="flex items-center gap-2.5 py-1.5">
              <span
                className={`w-5 text-center text-xs font-mono shrink-0 ${
                  isDone
                    ? "text-vc-green"
                    : isActive
                      ? "text-foreground animate-pulse"
                      : "text-border"
                }`}
              >
                {isDone ? "✓" : step.icon}
              </span>
              <span
                className={`text-sm font-mono ${
                  isDone
                    ? "text-vc-green"
                    : isActive
                      ? "text-foreground font-medium"
                      : "text-muted-foreground/40"
                }`}
              >
                {step.label}
              </span>
              {isActive && (
                <span className="ml-auto w-1.5 h-1.5 bg-foreground rounded-full animate-pulse shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Live log feed */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[0.65rem] uppercase tracking-[0.08em] text-muted-foreground font-mono">
            Live Output
          </span>
          <span className="text-[0.65rem] text-muted-foreground/50 font-mono">
            {logs.length} event{logs.length !== 1 ? "s" : ""}
          </span>
        </div>
        <LogFeed logs={logs} />
      </div>
    </div>
  );
}
