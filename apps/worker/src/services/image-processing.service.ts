import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { Logger } from "@emojis-bot/logger";

const logger = new Logger({ context: "ImageProcessingService" });

/**
 * Creates a directory if it doesn't exist
 * @param dirPath - The directory path to create
 */
export const ensureDirectoryExists = async (dirPath: string): Promise<void> => {
  try {
    await mkdir(dirPath, { recursive: true });
    logger.debug(`Directory ensured: ${dirPath}`);
  } catch (error) {
    logger.error(`Error creating directory ${dirPath}`, error instanceof Error ? error.stack : String(error));
    throw error;
  }
};

/**
 * Telegram File object from getFile API response
 */
export interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path: string;
}

/**
 * Telegram API response for getFile endpoint
 */
export interface TelegramGetFileResponse {
  ok: boolean;
  result: TelegramFile;
}

export const processImage = async (fileIds: string[]) => {
  logger.debug(`Processing ${fileIds.length} images`);
  const files = await Promise.all(fileIds.map(downloadFileFromTelegram));
  // TODO: Implement actual image processing logic here
  // For now, simulate processing
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return "path";
};

export const downloadFileFromTelegram = async (fileId: string, jobId: number): Promise<string> => {
  logger.debug(`Downloading file ${fileId}`);
  try {
    const link = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
    const response = await fetch(link);
    const fileData = (await response.json()) as TelegramGetFileResponse;
    
    if (!fileData.ok || !fileData.result) {
      throw new Error(`Failed to get file info for ${fileId}`);
    }

    const filePath = fileData.result.file_path;
    logger.debug(`File path retrieved: ${filePath} for file ${fileId}`);
    
    const imageDownloadLink = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;
    const imageResponse = await fetch(imageDownloadLink);
    const imageFile = await imageResponse.blob();
    const tempDir = path.join(process.cwd(), 'temp');
    await ensureDirectoryExists(tempDir);
    const imageFilePath = path.join(tempDir, `${jobId}-${fileId}.jpg`);
    await writeFile(imageFilePath, Buffer.from(await imageFile.arrayBuffer()));
    logger.debug(`Image file downloaded to: ${imageFilePath}`);
    return imageFilePath;
  } catch (error) {
    logger.error(`Error downloading file ${fileId}`, error instanceof Error ? error.stack : String(error));
    throw error;
  }
};
