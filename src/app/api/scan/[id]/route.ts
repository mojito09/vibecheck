import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const scan = await prisma.scan.findUnique({
    where: { id },
    include: {
      findings: {
        orderBy: [
          { severity: "asc" },
          { category: "asc" },
        ],
      },
      rescans: {
        select: { id: true, createdAt: true, overallScore: true, status: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  return NextResponse.json(scan);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { findingId, status } = body;

  if (!findingId || !["OPEN", "FIXED", "DISMISSED"].includes(status)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const finding = await prisma.finding.findFirst({
    where: { id: findingId, scanId: id },
  });

  if (!finding) {
    return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  }

  await prisma.finding.update({
    where: { id: findingId },
    data: { status: status as never },
  });

  return NextResponse.json({ success: true });
}
