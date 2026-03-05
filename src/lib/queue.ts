import { Queue, Worker, Job } from "bullmq";

const redisUrl = new URL(process.env.REDIS_URL || "redis://localhost:6379");

const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || "6379"),
  ...(redisUrl.username && { username: redisUrl.username }),
  ...(redisUrl.password && { password: redisUrl.password }),
};

export const scanQueue = new Queue("scan", { connection });

export type ScanMode = "quick" | "deep";

export interface ScanJobData {
  scanId: string;
  repoUrl: string;
  branch: string;
  scanMode: ScanMode;
  accessToken?: string;
}

export { Worker, Job, connection };
