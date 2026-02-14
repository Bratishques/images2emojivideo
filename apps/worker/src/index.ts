import { db, jobs, users, packs, User } from "@emojis-bot/db";
import { eq, and } from "drizzle-orm";
import { Logger } from "@emojis-bot/logger";
import { processImage } from "./services/image-processing.service";

const logger = new Logger({ context: "Worker" });

logger.log("Worker started");
let busy = false;
// Process pending jobs
async function processJobs() {
  if (!busy) {
    try {
      const transaction = await db.transaction(async (tx) => {
        const pendingJobs = await tx
        .select()
        .from(jobs)
        .where(eq(jobs.status, "pending"))
        .leftJoin(users, eq(jobs.userId, users.id))
        .limit(1);
        const job = pendingJobs[0];
        if (!job) {
          return;
        }
        busy = true;
        await tx.update(jobs).set({ status: "processing", updatedAt: new Date() }).where(eq(jobs.id, job.jobs.id));
        return job;
      }, {
        isolationLevel: "serializable",
      });

      if (!transaction) {
        logger.debug("No pending jobs found");
        return;
      }

      const job = transaction;
      logger.log(`Processing job ${job.jobs.id}...`);
      const fileIds = JSON.parse(job.jobs.fileIds) as string[];
      const resultFilePath = await processImage(fileIds, job.jobs, job.users as User);
      await db
        .update(jobs)
        .set({
          status: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
          resultFileId: resultFilePath,
        })
        .where(eq(jobs.id, job.jobs.id));

      logger.log(`Job ${job.jobs.id} completed successfully`);
    } catch (error) {
      logger.error("Error in processJobs", error instanceof Error ? error.stack : String(error));
    }
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

