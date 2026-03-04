"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface CursorPromptCopyProps {
  shortPrompt: string;
  detailedPrompt: string;
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="14" height="14" x="8" y="8" rx="0" ry="0" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CursorLogo({ className, size = 14 }: { className?: string; size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 130 146"
      className={className}
    >
      <path
        fill="currentColor"
        d="M60.66 0h3.76c18.25 10.62 36.57 21.12 54.83 31.72 1.99 1.29 4.29 2.46 5.47 4.62.62 2.83.34 5.76.39 8.64-.04 18.65-.03 37.3 0 55.95-.04 1.91.03 3.86-.38 5.75-1.2 1.86-3.23 2.94-5.05 4.09-15.65 8.95-31.23 18.03-46.83 27.06-3.32 1.85-6.49 4.08-10.11 5.34-2.23-.32-4.17-1.6-6.12-2.63-15.81-9.32-31.8-18.32-47.62-27.62C5.85 111.16 2.79 109.23 0 106.93V36.1c3.83-3.78 8.81-5.98 13.34-8.77C29.1 18.19 44.82 8.98 60.66 0z"
      />
      <path
        fill="var(--background, #E2E2E2)"
        d="M5.62 38.04c4.45-.51 8.92-.02 13.37-.17 27.36-.02 54.71-.02 82.07 0 6.17.04 12.35-.22 18.51.27-.73 2.28-1.68 4.48-2.92 6.53C99.93 73.92 83.07 103.08 66.24 132.27c-.95 1.71-2.06 3.33-3.23 5.1-.29-1.73-.47-3.48-.47-5.24-.03-15.64.03-31.29 0-46.93-.05-4.57.31-9.18-.5-13.7-15.55-9.41-31.45-18.24-47-27.5-3.08-1.97-6.68-3.16-9.42-5.96z"
      />
    </svg>
  );
}

function useCopy() {
  const [copied, setCopied] = useState(false);

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return { copied, copy };
}

export function CursorPromptCopy({ shortPrompt, detailedPrompt }: CursorPromptCopyProps) {
  const quickCopy = useCopy();
  const detailedCopy = useCopy();

  return (
    <div className="flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1.5 text-foreground hover:bg-card cursor-pointer font-mono uppercase tracking-wider"
            onClick={() => quickCopy.copy(shortPrompt)}
          >
            {quickCopy.copied ? <CheckIcon /> : <CursorLogo />}
            {quickCopy.copied ? "Copied!" : "Quick Fix"}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Copy a one-liner prompt for Cursor</p>
        </TooltipContent>
      </Tooltip>

      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground hover:bg-card cursor-pointer font-mono uppercase tracking-wider"
          >
            <CursorLogo />
            Detailed
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono text-sm uppercase tracking-wider">
              <CursorLogo size={18} />
              Cursor Fix Prompt
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Quick Prompt</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5 cursor-pointer font-mono"
                    onClick={() => quickCopy.copy(shortPrompt)}
                  >
                    {quickCopy.copied ? <CheckIcon /> : <CopyIcon />}
                    {quickCopy.copied ? "Copied!" : "Copy"}
                  </Button>
                </div>
                <pre className="bg-card border border-border p-3 text-sm whitespace-pre-wrap font-mono">
                  {shortPrompt}
                </pre>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    Detailed Prompt
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5 cursor-pointer font-mono"
                    onClick={() => detailedCopy.copy(detailedPrompt)}
                  >
                    {detailedCopy.copied ? <CheckIcon /> : <CopyIcon />}
                    {detailedCopy.copied ? "Copied!" : "Copy"}
                  </Button>
                </div>
                <pre className="bg-card border border-border p-3 text-sm whitespace-pre-wrap font-mono max-h-96 overflow-y-auto">
                  {detailedPrompt}
                </pre>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
