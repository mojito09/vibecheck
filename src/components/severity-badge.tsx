import type { Severity } from "@/types/scan";

const SEVERITY_STYLES: Record<Severity, string> = {
  CRITICAL: "border-red-600 text-red-700 bg-red-600/10",
  HIGH: "border-orange-600 text-orange-700 bg-orange-600/10",
  MEDIUM: "border-yellow-600 text-yellow-700 bg-yellow-600/10",
  LOW: "border-blue-600 text-blue-700 bg-blue-600/10",
  INFO: "border-muted-foreground text-muted-foreground bg-muted-foreground/10",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[0.65rem] font-mono uppercase tracking-wider border ${SEVERITY_STYLES[severity]}`}
    >
      {severity}
    </span>
  );
}
