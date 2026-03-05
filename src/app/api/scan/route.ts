import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scanQueue } from "@/lib/queue";
import type { ScanMode } from "@/lib/queue";

const GITHUB_URL_REGEX = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/;

function extractRepoName(url: string): string {
  const parts = url.replace(/\/$/, "").split("/");
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { repoUrl, branch = "main", parentScanId, scanMode = "quick" } = body;

    if (!repoUrl || !GITHUB_URL_REGEX.test(repoUrl)) {
      return NextResponse.json(
        { error: "Invalid GitHub repository URL. Use format: https://github.com/owner/repo" },
        { status: 400 }
      );
    }

    const validMode: ScanMode = scanMode === "deep" ? "deep" : "quick";
    const normalizedUrl = repoUrl.replace(/\/$/, "");
    const repoName = extractRepoName(normalizedUrl);

    if (parentScanId) {
      const parentScan = await prisma.scan.findUnique({ where: { id: parentScanId } });
      if (!parentScan) {
        return NextResponse.json({ error: "Parent scan not found" }, { status: 404 });
      }
    }

    const scan = await prisma.scan.create({
      data: {
        repoUrl: normalizedUrl,
        repoName,
        branch,
        scanMode: validMode,
        status: "QUEUED",
        progress: 0,
        progressMessage: "Scan queued...",
        parentScanId: parentScanId || null,
      },
    });

    await scanQueue.add("scan", {
      scanId: scan.id,
      repoUrl: normalizedUrl,
      branch,
      scanMode: validMode,
    });

    return NextResponse.json({ scanId: scan.id }, { status: 201 });
  } catch (error) {
    console.error("Failed to create scan:", error);
    return NextResponse.json(
      { error: "Failed to create scan" },
      { status: 500 }
    );
  }
}
