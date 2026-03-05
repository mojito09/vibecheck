import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDbUser } from "@/lib/auth";

export async function GET() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const scans = await prisma.scan.findMany({
    where: { userId: user.id },
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
