import { mkdir, readdir, rm } from "fs/promises";
import path from "path";
import { Logger } from "@emojis-bot/logger";

const logger = new Logger({ context: "FileUtils" });

/**
 * Directory for intermediate files (downloaded images, grid pieces, videos).
 * Defaults to `<cwd>/temp`, can be overridden with WORKER_TEMP_DIR.
 */
export const getTempDir = (): string => process.env.WORKER_TEMP_DIR || path.join(process.cwd(), "temp");

/**
 * Creates a directory if it doesn't exist
 * @param dirPath - The directory path to create
 */
export const ensureDirectoryExists = async (dirPath: string): Promise<void> => {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (error) {
    logger.error(`Error creating directory ${dirPath}`, error instanceof Error ? error.stack : String(error));
    throw error;
  }
};

/**
 * Removes all intermediate files of a job (`<jobId>-*` in the temp directory)
 */
export const cleanupJobFiles = async (jobId: number): Promise<void> => {
  const tempDir = getTempDir();
  try {
    const files = await readdir(tempDir);
    await Promise.all(
      files
        .filter((file) => file.startsWith(`${jobId}-`))
        .map((file) => rm(path.join(tempDir, file), { force: true })),
    );
  } catch (error) {
    logger.warn(`Failed to clean up temp files of job ${jobId}: ${error instanceof Error ? error.message : String(error)}`);
  }
};
