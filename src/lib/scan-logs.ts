import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

let publishClient: Redis | null = null;
let subscribeClient: Redis | null = null;

function getPublishClient(): Redis {
  if (!publishClient) {
    publishClient = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });
    publishClient.connect().catch(() => {});
  }
  return publishClient;
}

function getSubscribeClient(): Redis {
  if (!subscribeClient) {
    subscribeClient = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });
    subscribeClient.connect().catch(() => {});
  }
  return subscribeClient;
}

function logKey(scanId: string): string {
  return `scan:${scanId}:logs`;
}

export async function pushLogMessage(scanId: string, message: string): Promise<void> {
  const client = getPublishClient();
  const entry = JSON.stringify({ t: Date.now(), m: message });
  try {
    await client.rpush(logKey(scanId), entry);
    await client.expire(logKey(scanId), 600);
  } catch {
    // non-critical, don't fail the scan
  }
}

export async function getLogMessages(
  scanId: string,
  sinceIndex: number = 0
): Promise<{ messages: { t: number; m: string }[]; nextIndex: number }> {
  const client = getSubscribeClient();
  try {
    const raw = await client.lrange(logKey(scanId), sinceIndex, -1);
    const messages = raw.map((r) => JSON.parse(r));
    return { messages, nextIndex: sinceIndex + raw.length };
  } catch {
    return { messages: [], nextIndex: sinceIndex };
  }
}

export async function clearLogMessages(scanId: string): Promise<void> {
  const client = getPublishClient();
  try {
    await client.del(logKey(scanId));
  } catch {
    // non-critical
  }
}
