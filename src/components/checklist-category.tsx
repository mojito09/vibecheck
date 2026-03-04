"use client";

import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChecklistItem } from "@/components/checklist-item";
import type { FindingResult } from "@/types/scan";
import { CATEGORY_LABELS, CATEGORY_LABELS_PLAIN } from "@/types/scan";

interface ChecklistCategoryProps {
  category: string;
  findings: FindingResult[];
  scanId: string;
  devMode: boolean;
}

export function ChecklistCategory({ category, findings, scanId, devMode }: ChecklistCategoryProps) {
  const [open, setOpen] = useState(true);

  const openCount = findings.filter((f) => f.status === "OPEN").length;
  const fixedCount = findings.length - openCount;
  const allFixed = openCount === 0;
  const categoryLabels = devMode ? CATEGORY_LABELS : CATEGORY_LABELS_PLAIN;
  const label = categoryLabels[category] || CATEGORY_LABELS[category] || category.replace(/_/g, " ");

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full cursor-pointer" asChild>
        <button className="w-full">
          <div
            className={`flex items-center justify-between py-3 px-3 border-b border-border transition-colors hover:bg-card/40 ${
              allFixed ? "bg-vc-green/5" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`text-xs transition-transform duration-200 ${open ? "rotate-90" : ""}`}
              >
                &#9654;
              </span>
              <h3 className={`font-medium text-sm text-left ${allFixed ? "text-vc-green" : ""}`}>
                {label}
              </h3>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              {fixedCount > 0 && (
                <span className="text-vc-green">{fixedCount} fixed</span>
              )}
              {openCount > 0 && (
                <span className="text-muted-foreground">{openCount} open</span>
              )}
            </div>
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 py-3 pl-6">
          {findings.map((finding) => (
            <ChecklistItem key={finding.id} finding={finding} scanId={scanId} devMode={devMode} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
