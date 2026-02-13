import { db, jobs, users, packs } from "@emojis-bot/db";
import { eq, and } from "drizzle-orm";
import { Logger } from "@emojis-bot/logger";
import { processImage } from "./services/image-processing.service";

const logger = new Logger({ context: "Worker" });

logger.log("Worker started");

// Process pending jobs
async function processJobs() {
  try {
    const transaction = await db.transaction(async (tx) => {
      const pendingJobs = await tx.select().from(jobs).where(eq(jobs.status, "pending")).limit(1);
      const job = pendingJobs[0];
      if (!job) {
        return;
      }
      await tx.update(jobs).set({ status: "processing", updatedAt: new Date() }).where(eq(jobs.id, job.id));
      return job;
    }, {
      isolationLevel: "serializable",
    });

    if (!transaction) {
      logger.debug("No pending jobs found");
      return;
    }

    const job = transaction;
    logger.log(`Processing job ${job.id}...`);
    const fileIds = JSON.parse(job.fileIds) as string[];
    const resultFilePath = await processImage(fileIds);
    await db
      .update(jobs)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
        resultFileId: resultFilePath,
      })
      .where(eq(jobs.id, job.id));

    logger.log(`Job ${job.id} completed successfully`);
  } catch (error) {
    logger.log(error);
    logger.error("Error in processJobs", error instanceof Error ? error.stack : String(error));
  }

}

// Run job processor every 5 seconds
setInterval(processJobs, 5000);

// Run immediately on start
processJobs();

// Graceful shutdown
process.once("SIGINT", () => {
  logger.warn("Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.once("SIGTERM", () => {
  logger.warn("Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

