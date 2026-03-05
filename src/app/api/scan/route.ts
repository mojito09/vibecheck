import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scanQueue } from "@/lib/queue";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { getDbUser } from "@/lib/auth";

const GITHUB_URL_REGEX = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/;

const SCAN_RATE_LIMIT = 10;
const SCAN_RATE_WINDOW_SECONDS = 3600;

function extractRepoName(url: string): string {
  const parts = url.replace(/\/$/, "").split("/");
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const { allowed, remaining, retryAfterSeconds } = await checkRateLimit(
      `scan:${ip}`,
      SCAN_RATE_LIMIT,
      SCAN_RATE_WINDOW_SECONDS
    );

    if (!allowed) {
      return NextResponse.json(
        { error: `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.` },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSeconds),
            "X-RateLimit-Limit": String(SCAN_RATE_LIMIT),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const body = await request.json();
    const { repoUrl, branch = "main", parentScanId } = body;

    if (!repoUrl || !GITHUB_URL_REGEX.test(repoUrl)) {
      return NextResponse.json(
        { error: "Invalid GitHub repository URL. Use format: https://github.com/owner/repo" },
        { status: 400 }
      );
    }

    const normalizedUrl = repoUrl.replace(/\/$/, "");
    const repoName = extractRepoName(normalizedUrl);

    if (parentScanId) {
      const parentScan = await prisma.scan.findUnique({ where: { id: parentScanId } });
      if (!parentScan) {
        return NextResponse.json({ error: "Parent scan not found" }, { status: 404 });
      }
    }

    const user = await getDbUser();

    const scan = await prisma.scan.create({
      data: {
        repoUrl: normalizedUrl,
        repoName,
        branch,
        scanMode: "deep",
        status: "QUEUED",
        progress: 0,
        progressMessage: "Scan queued...",
        parentScanId: parentScanId || null,
        userId: user?.id ?? null,
      },
    });

    await scanQueue.add("scan", {
      scanId: scan.id,
      repoUrl: normalizedUrl,
      branch,
    });

    return NextResponse.json({ scanId: scan.id }, {
      status: 201,
      headers: {
        "X-RateLimit-Limit": String(SCAN_RATE_LIMIT),
        "X-RateLimit-Remaining": String(remaining),
      },
    });
  } catch (error) {
    console.error("Failed to create scan:", error);
    return NextResponse.json(
      { error: "Failed to create scan" },
      { status: 500 }
    );
  }
}
