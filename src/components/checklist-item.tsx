"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SeverityBadge } from "@/components/severity-badge";
import { CursorPromptCopy } from "@/components/cursor-prompt-copy";
import type { FindingResult } from "@/types/scan";

interface ChecklistItemProps {
  finding: FindingResult;
  scanId: string;
  devMode: boolean;
}

export function ChecklistItem({ finding, scanId, devMode }: ChecklistItemProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(finding.status);
  const isResolved = status === "FIXED" || status === "DISMISSED";

  async function toggleStatus() {
    const newStatus = isResolved ? "OPEN" : "FIXED";
    setStatus(newStatus);

    await fetch(`/api/scan/${scanId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ findingId: finding.id, status: newStatus }),
    });
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={`border transition-colors ${
          isResolved
            ? "border-vc-green/20 bg-vc-green/5"
            : "border-border hover:border-muted-foreground/30"
        }`}
      >
        <div className="flex items-start gap-3 p-3">
          <div className="pt-0.5">
            <Checkbox
              checked={isResolved}
              onCheckedChange={toggleStatus}
              className="cursor-pointer"
            />
          </div>

          <CollapsibleTrigger className="flex-1 text-left cursor-pointer" asChild>
            <button className="flex-1 text-left w-full">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <SeverityBadge severity={finding.severity} />
                    <span
                      className={`text-sm ${
                        isResolved ? "line-through text-muted-foreground" : ""
                      }`}
                    >
                      {devMode ? finding.title : (finding.plainTitle || finding.title)}
                    </span>
                  </div>
                  {devMode && (
                    <p className="text-xs text-muted-foreground mt-1 font-mono">
                      {finding.filePath}
                      {finding.lineStart ? `:${finding.lineStart}` : ""}
                      {" \u2014 "}
                      <span className="capitalize">{finding.detectedBy.replace("-", " ")}</span>
                    </p>
                  )}
                </div>
                <span
                  className={`text-xs transition-transform duration-200 text-muted-foreground mt-1 ${open ? "rotate-90" : ""}`}
                >
                  &#9654;
                </span>
              </div>
            </button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <div className="px-3 pb-3 pt-0 space-y-4 border-t border-border/50 ml-8">
            <div className="pt-3">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {devMode ? finding.description : (finding.plainDescription || finding.description)}
              </p>
            </div>

            {devMode && finding.codeSnippet && (
              <div>
                <span className="text-[0.65rem] font-mono uppercase tracking-wider text-muted-foreground">
                  Vulnerable Code
                </span>
                <pre className="mt-1 bg-card p-3 text-xs font-mono overflow-x-auto border border-border">
                  {finding.codeSnippet}
                </pre>
              </div>
            )}

            {devMode && finding.fixSuggestion && (
              <div>
                <span className="text-[0.65rem] font-mono uppercase tracking-wider text-muted-foreground">
                  How to Fix
                </span>
                <p className="mt-1 text-sm text-foreground/80 leading-relaxed">
                  {finding.fixSuggestion}
                </p>
              </div>
            )}

            {devMode && finding.fixCode && (
              <div>
                <span className="text-[0.65rem] font-mono uppercase tracking-wider text-muted-foreground">
                  Suggested Fix
                </span>
                <pre className="mt-1 bg-vc-green/5 border border-vc-green/20 p-3 text-xs font-mono overflow-x-auto">
                  {finding.fixCode}
                </pre>
              </div>
            )}

            {(finding.cursorPromptShort || finding.cursorPromptDetailed) && (
              <div className="pt-1">
                <CursorPromptCopy
                  shortPrompt={finding.cursorPromptShort || finding.title}
                  detailedPrompt={finding.cursorPromptDetailed || finding.description}
                />
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
