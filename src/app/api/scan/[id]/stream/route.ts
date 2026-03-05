import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getLogMessages } from "@/lib/scan-logs";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      let completed = false;
      let retries = 0;
      const maxRetries = 300;
      let logIndex = 0;

      while (!completed && retries < maxRetries) {
        try {
          const scan = await prisma.scan.findUnique({
            where: { id },
            select: {
              status: true,
              progress: true,
              progressMessage: true,
              overallScore: true,
              scanMode: true,
            },
          });

          if (!scan) {
            sendEvent({ error: "Scan not found" });
            break;
          }

          const { messages: newLogs, nextIndex } = await getLogMessages(id, logIndex);
          logIndex = nextIndex;

          sendEvent({
            status: scan.status,
            progress: scan.progress,
            message: scan.progressMessage,
            score: scan.overallScore,
            scanMode: scan.scanMode,
            logs: newLogs,
          });

          if (scan.status === "COMPLETED" || scan.status === "FAILED") {
            completed = true;
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 800));
          retries++;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          retries++;
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
