import { Queue, Worker, Job } from "bullmq";

const connection = {
  host: new URL(process.env.REDIS_URL || "redis://localhost:6379").hostname,
  port: parseInt(new URL(process.env.REDIS_URL || "redis://localhost:6379").port || "6379"),
};

export const scanQueue = new Queue("scan", { connection });

export interface ScanJobData {
  scanId: string;
  repoUrl: string;
  branch: string;
  accessToken?: string;
}

export { Worker, Job, connection };
