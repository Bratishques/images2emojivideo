import { writeFile } from "fs/promises";
import path from "path";
import { Logger } from "@emojis-bot/logger";
import { TelegramGetFileResponse } from "./telegram.types";
import { ensureDirectoryExists } from "./file-utils";

const logger = new Logger({ context: "TelegramDownload" });

export const downloadFileFromTelegram = async (fileId: string, jobId: number, index: number): Promise<string> => {
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
    logger.debug(`Image download link: ${imageDownloadLink}`);
    const imageResponse = await fetch(imageDownloadLink);
    const imageFile = await imageResponse.blob();
    const tempDir = path.join(process.cwd(), 'temp');
    await ensureDirectoryExists(tempDir);
    const imageFilePath = path.join(tempDir, `${jobId}-${index}.png`);
    await writeFile(imageFilePath, Buffer.from(await imageFile.arrayBuffer()));
    logger.debug(`Image file downloaded to: ${imageFilePath}`);
    return imageFilePath;
  } catch (error) {
    logger.error(`Error downloading file ${fileId}`, error instanceof Error ? error.stack : String(error));
    throw error;
  }
};

