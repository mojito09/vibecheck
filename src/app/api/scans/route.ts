import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const scans = await prisma.scan.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      repoName: true,
      repoUrl: true,
      status: true,
      overallScore: true,
      createdAt: true,
      completedAt: true,
      _count: { select: { findings: true } },
    },
  });

  return NextResponse.json({ scans });
}
