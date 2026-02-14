import { mkdir } from "fs/promises";
import { Logger } from "@emojis-bot/logger";

const logger = new Logger({ context: "FileUtils" });

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

