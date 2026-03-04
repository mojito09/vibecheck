"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScoreGauge } from "@/components/score-gauge";
import { ChecklistCategory } from "@/components/checklist-category";
import { BatchPromptCopy } from "@/components/batch-prompt-copy";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { ScanResult, Severity, FindingResult } from "@/types/scan";
import { SEVERITY_ORDER, CATEGORY_LABELS, CATEGORY_LABELS_PLAIN } from "@/types/scan";

interface ChecklistReportProps {
  scan: ScanResult;
}

type FilterSeverity = "ALL" | Severity;

function CodeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

export function ChecklistReport({ scan }: ChecklistReportProps) {
  const [severityFilter, setSeverityFilter] = useState<FilterSeverity>("ALL");
  const [showFixed, setShowFixed] = useState(true);
  const [devMode, setDevMode] = useState(false);

  const categoryLabels = devMode ? CATEGORY_LABELS : CATEGORY_LABELS_PLAIN;

  const filteredFindings = useMemo(() => {
    return scan.findings.filter((f) => {
      if (severityFilter !== "ALL" && f.severity !== severityFilter) return false;
      if (!showFixed && (f.status === "FIXED" || f.status === "DISMISSED")) return false;
      return true;
    });
  }, [scan.findings, severityFilter, showFixed]);

  const groupedFindings = useMemo(() => {
    const groups: Record<string, FindingResult[]> = {};
    for (const finding of filteredFindings) {
      if (!groups[finding.category]) groups[finding.category] = [];
      groups[finding.category].push(finding);
    }
    const sortedEntries = Object.entries(groups).sort(([, a], [, b]) => {
      const aMax = Math.min(...a.map((f) => SEVERITY_ORDER[f.severity]));
      const bMax = Math.min(...b.map((f) => SEVERITY_ORDER[f.severity]));
      return aMax - bMax;
    });
    return sortedEntries;
  }, [filteredFindings]);

  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    for (const f of scan.findings) {
      if (f.status === "OPEN") counts[f.severity]++;
    }
    return counts;
  }, [scan.findings]);

  const openCount = scan.findings.filter((f) => f.status === "OPEN").length;
  const fixedCount = scan.findings.filter((f) => f.status === "FIXED").length;

  const improvementSummary = useMemo(() => {
    const DEDUCTION_MAP: Record<Severity, number> = {
      CRITICAL: 15, HIGH: 10, MEDIUM: 5, LOW: 2, INFO: 1,
    };

    const categoryDeductions: Record<string, { points: number; count: number; topSeverity: Severity }> = {};

    for (const f of scan.findings) {
      if (f.status !== "OPEN") continue;
      const weight = f.category === "vulnerable_deps" ? 0.3 : 1;
      const pts = DEDUCTION_MAP[f.severity] * weight;

      if (!categoryDeductions[f.category]) {
        categoryDeductions[f.category] = { points: 0, count: 0, topSeverity: f.severity };
      }
      categoryDeductions[f.category].points += pts;
      categoryDeductions[f.category].count++;
      if (SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[categoryDeductions[f.category].topSeverity]) {
        categoryDeductions[f.category].topSeverity = f.severity;
      }
    }

    const items = Object.entries(categoryDeductions)
      .map(([category, data]) => ({
        category,
        label: categoryLabels[category] || CATEGORY_LABELS[category] || category.replace(/_/g, " "),
        points: Math.round(data.points * 10) / 10,
        count: data.count,
        topSeverity: data.topSeverity,
      }))
      .sort((a, b) => b.points - a.points);

    const totalRecoverable = items.reduce((sum, item) => sum + item.points, 0);
    const potentialScore = Math.min(100, Math.round((scan.overallScore || 0) + totalRecoverable));

    return { items, potentialScore };
  }, [scan.findings, scan.overallScore, categoryLabels]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2 px-1">
        <Label
          htmlFor="dev-mode"
          className="text-xs text-muted-foreground flex items-center gap-1.5 cursor-pointer select-none"
        >
          <CodeIcon />
          Developer Mode
        </Label>
        <Switch
          id="dev-mode"
          checked={devMode}
          onCheckedChange={setDevMode}
          className="cursor-pointer"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6">
        <Card className="bg-card/30 border-border/30">
          <CardContent className="pt-6 flex flex-col items-center gap-3">
            <ScoreGauge score={scan.overallScore || 0} />
            <div className="text-center">
              <p className="text-sm font-medium">Security Score</p>
              <p className="text-xs text-muted-foreground">
                {scan.repoName}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/30 border-border/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {scan.summary}
            </p>

            <div className="flex flex-wrap gap-2">
              {severityCounts.CRITICAL > 0 && (
                <Badge className="bg-red-500/15 text-red-400 border-red-500/30">
                  {severityCounts.CRITICAL} Critical
                </Badge>
              )}
              {severityCounts.HIGH > 0 && (
                <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/30">
                  {severityCounts.HIGH} High
                </Badge>
              )}
              {severityCounts.MEDIUM > 0 && (
                <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30">
                  {severityCounts.MEDIUM} Medium
                </Badge>
              )}
              {severityCounts.LOW > 0 && (
                <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30">
                  {severityCounts.LOW} Low
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{openCount} open</span>
              <span>{fixedCount} fixed</span>
              <span>{scan.findings.length} total</span>
            </div>

            {scan.languages.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {scan.languages.map((lang) => (
                  <Badge key={lang} variant="outline" className="text-xs capitalize">
                    {lang}
                  </Badge>
                ))}
                {scan.frameworks.map((fw) => (
                  <Badge key={fw} variant="outline" className="text-xs">
                    {fw}
                  </Badge>
                ))}
              </div>
            )}

            {improvementSummary.items.length > 0 && (
              <div className="border-t border-border/30 pt-4 space-y-3">
                <p className="text-sm font-medium">What to improve</p>
                <ul className="space-y-1.5">
                  {improvementSummary.items.map((item) => (
                    <li key={item.category} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className={`mt-0.5 shrink-0 size-1.5 rounded-full ${
                        item.topSeverity === "CRITICAL" ? "bg-red-400" :
                        item.topSeverity === "HIGH" ? "bg-orange-400" :
                        item.topSeverity === "MEDIUM" ? "bg-yellow-400" :
                        "bg-blue-400"
                      }`} />
                      <span>
                        {item.label}
                        <span className="text-muted-foreground/60">
                          {" "}({item.count} issue{item.count !== 1 ? "s" : ""}, −{item.points} pts)
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">Potential score after fixes:</span>
                  <span className={`text-sm font-semibold ${
                    improvementSummary.potentialScore >= 80 ? "text-green-400" :
                    improvementSummary.potentialScore >= 60 ? "text-yellow-400" :
                    improvementSummary.potentialScore >= 40 ? "text-orange-400" :
                    "text-red-400"
                  }`}>
                    {improvementSummary.potentialScore}/100
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <Tabs
          value={severityFilter}
          onValueChange={(v) => setSeverityFilter(v as FilterSeverity)}
        >
          <TabsList className="bg-muted/30">
            <TabsTrigger value="ALL" className="text-xs cursor-pointer">All</TabsTrigger>
            <TabsTrigger value="CRITICAL" className="text-xs cursor-pointer">Critical</TabsTrigger>
            <TabsTrigger value="HIGH" className="text-xs cursor-pointer">High</TabsTrigger>
            <TabsTrigger value="MEDIUM" className="text-xs cursor-pointer">Medium</TabsTrigger>
            <TabsTrigger value="LOW" className="text-xs cursor-pointer">Low</TabsTrigger>
          </TabsList>
        </Tabs>

        <Button
          variant="ghost"
          size="sm"
          className="text-xs cursor-pointer"
          onClick={() => setShowFixed(!showFixed)}
        >
          {showFixed ? "Hide fixed" : "Show fixed"}
        </Button>
      </div>

      {openCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground mr-1">Batch fix:</span>
          {(severityCounts.CRITICAL > 0 || severityCounts.HIGH > 0) && (
            <BatchPromptCopy
              findings={scan.findings}
              severity="ALL_CRITICAL"
              commitSha={scan.commitSha}
              repoName={scan.repoName}
            />
          )}
          {severityCounts.CRITICAL > 0 && (
            <BatchPromptCopy
              findings={scan.findings}
              severity="CRITICAL"
              commitSha={scan.commitSha}
              repoName={scan.repoName}
            />
          )}
          {severityCounts.HIGH > 0 && (
            <BatchPromptCopy
              findings={scan.findings}
              severity="HIGH"
              commitSha={scan.commitSha}
              repoName={scan.repoName}
            />
          )}
          {severityCounts.MEDIUM > 0 && (
            <BatchPromptCopy
              findings={scan.findings}
              severity="MEDIUM"
              commitSha={scan.commitSha}
              repoName={scan.repoName}
            />
          )}
          {severityCounts.LOW > 0 && (
            <BatchPromptCopy
              findings={scan.findings}
              severity="LOW"
              commitSha={scan.commitSha}
              repoName={scan.repoName}
            />
          )}
        </div>
      )}

      <div className="space-y-4">
        {groupedFindings.length === 0 ? (
          <Card className="bg-card/30 border-border/30">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                {scan.findings.length === 0
                  ? scan.languages.length === 0
                    ? "No analyzable source code was found in this repository."
                    : "No issues found! Your code looks clean."
                  : "No findings match the current filters."}
              </p>
            </CardContent>
          </Card>
        ) : (
          groupedFindings.map(([category, findings]) => (
            <ChecklistCategory
              key={category}
              category={category}
              findings={findings}
              scanId={scan.id}
              devMode={devMode}
            />
          ))
        )}
      </div>
    </div>
  );
}
