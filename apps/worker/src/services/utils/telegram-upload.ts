import { readFile } from "fs/promises";
import path from "path";
import { Logger } from "@emojis-bot/logger";
import { TelegramApiResponse } from "./telegram.types";

const logger = new Logger({ context: "TelegramUpload" });

/**
 * Uploads a file to Telegram using multipart/form-data
 * @param apiMethod - Telegram Bot API method (e.g., "uploadStickerFile")
 * @param filePath - Path to the file to upload
 * @param additionalFields - Additional form fields to include in the request
 * @returns Promise with the API response
 */
export const uploadFileToTelegram = async (
  apiMethod: string,
  filePath: string,
  additionalFields: Record<string, string | number> = {}
): Promise<any> => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }

  const apiUrl = `https://api.telegram.org/bot${botToken}/uploadStickerFile`;
  
  try {
    // Read file
    const fileBuffer = await readFile(filePath);
    const fileName = path.basename(filePath);
    
    // Create FormData
    const formData = new FormData();
    
    // Add file
    const fileBlob = new Blob([fileBuffer]);
    formData.append("sticker", fileBlob, fileName);
    formData.append("sticker_format", "video");
    formData.append("user_id", String(additionalFields.user_id));
    
    logger.debug(`Uploading file ${fileName} to ${apiMethod}`);
    
    // Send request
    const response = await fetch(apiUrl, {
      method: "POST",
      body: formData,
    });
    
    const result = (await response.json()) as TelegramApiResponse;
    
    if (!result.ok) {
      throw new Error(`Telegram API error: ${result.description || "Unknown error"}`);
    }
    
    logger.debug(`File ${fileName} uploaded successfully`);
    return result;
  } catch (error) {
    logger.error(
      `Error uploading file ${filePath} to ${apiMethod}`,
      error instanceof Error ? error.stack : String(error)
    );
    throw error;
  }
};

/**
 * Uploads a sticker file to Telegram
 * @param userId - Telegram user ID
 * @param filePath - Path to the video file
 * @returns Promise with the uploaded file information
 */
export const uploadStickerFile = async (
  userId: number,
  filePath: string
): Promise<{ file_id: string }> => {
  const result = await uploadFileToTelegram("uploadStickerFile", filePath, {
    user_id: userId,
  });
  
  return result.result;
};

