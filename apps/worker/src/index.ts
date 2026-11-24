import { db, jobs, User } from "@emojis-bot/db";
import { eq } from "drizzle-orm";
import { Logger } from "@emojis-bot/logger";
import { processImage } from "./services/image-processing.service";
import { claimNextJob } from "./claim-job";

const logger = new Logger({ context: "Worker" });

logger.log("Worker started");

const POLL_INTERVAL_MS = 5000;
let busy = false;

// Process pending jobs one at a time
async function processJobs() {
  if (busy) return;
  busy = true;
  let jobId: number | undefined;
  try {
    const claimed = await claimNextJob();
    if (!claimed) {
      logger.debug("No pending jobs found");
      return;
    }
    const { job, user } = claimed;
    jobId = job.id;
    if (!user) {
      throw new Error(`User ${job.userId} of job ${job.id} not found`);
    }

    logger.log(`Processing job ${job.id}...`);
    const fileIds = JSON.parse(job.fileIds) as string[];
    const stickerSetName = await processImage(fileIds, job, user as User);
    await db
      .update(jobs)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
        resultFileId: stickerSetName,
      })
      .where(eq(jobs.id, job.id));

    logger.log(`Job ${job.id} completed successfully`);
  } catch (error) {
    logger.error(`Error in processJobs${jobId ? ` (job ${jobId})` : ""}`, error instanceof Error ? error.stack : String(error));
    if (jobId !== undefined) {
      await db
        .update(jobs)
        .set({
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error),
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId))
        .catch((dbError: unknown) =>
          logger.error(`Failed to mark job ${jobId} as failed`, dbError instanceof Error ? dbError.stack : String(dbError)),
        );
    }
  } finally {
    busy = false;
  }
}

setInterval(processJobs, POLL_INTERVAL_MS);

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
