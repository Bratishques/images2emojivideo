import { Logger } from "@emojis-bot/logger";
import { Telegraf } from "telegraf";
import { downloadFileFromTelegram } from "./utils/telegram-download";
import { getImageDimensions, calculateGridSize, splitImageIntoGrid } from "./utils/image-grid";
import { createVideosFromPieces } from "./utils/video";
import { uploadStickerFile } from "./utils/telegram-upload";
import { Job, User } from "@emojis-bot/db";
import { cleanupJobFiles } from "./utils/file-utils";

const logger = new Logger({ context: "ImageProcessingService" });

const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const ownerName = (user: User): string => user.username || user.firstName || `user${user.telegramId}`;
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN as string);
const botUsername = (await bot.telegram.getMe()).username;

export const processImage = async (
  fileIds: string[], 
  {id: jobId}: Job,
  user: User
) => {
  try {
    return await buildStickerSet(fileIds, jobId, user);
  } finally {
    await cleanupJobFiles(jobId);
  }
};

const buildStickerSet = async (fileIds: string[], jobId: number, user: User): Promise<string> => {
  logger.log(`Starting image processing for job ${jobId}, user ${user.username} (${user.telegramId})`);
  logger.log(`Processing ${fileIds.length} images`);
  
  // Stage 1: Download images from Telegram
  logger.log(`Stage 1: Downloading ${fileIds.length} images from Telegram`);
  const files = await Promise.all(fileIds.map((fileId, index) => downloadFileFromTelegram(fileId, jobId, index)));
  logger.log(`Stage 1 completed: ${files.length} images downloaded`);
  
  if (files.length === 0) {
    logger.error("No files to process after download");
    throw new Error("No files to process");
  }
  
  // Stage 2: Get aspect ratio from first image
  logger.log(`Stage 2: Analyzing image dimensions and calculating aspect ratio`);
  const firstImageDimensions = await getImageDimensions(files[0]);
  const aspectRatio = firstImageDimensions.width / firstImageDimensions.height;
  logger.log(`Stage 2 completed: Aspect ratio determined as ${aspectRatio.toFixed(4)} (${firstImageDimensions.width}x${firstImageDimensions.height})`);
  
  // Stage 3: Calculate grid size
  logger.log(`Stage 3: Calculating grid size based on aspect ratio`);
  const { cols, rows } = calculateGridSize(aspectRatio);
  logger.log(`Stage 3 completed: Grid size calculated as ${cols}x${rows} (${cols * rows} pieces per image)`);
  
  // Stage 4: Split all images into grid pieces
  logger.log(`Stage 4: Splitting ${files.length} images into grid pieces`);
  const allPieces: string[] = [];
  for (let i = 0; i < files.length; i++) {
    logger.debug(`Splitting image ${i + 1}/${files.length}`);
    const pieces = await splitImageIntoGrid(files[i], jobId, i, cols, rows);
    allPieces.push(...pieces);
  }
  logger.log(`Stage 4 completed: ${allPieces.length} pieces created from ${files.length} images`);
  
  // Stage 5: Create videos from grid pieces
  logger.log(`Stage 5: Creating videos from ${allPieces.length} grid pieces`);
  const videoPaths = await createVideosFromPieces(jobId, files.length, rows, cols);
  logger.log(`Stage 5 completed: ${videoPaths.length} videos created`);

  // Telegram requires sticker set name to be lowercase, alphanumeric with underscores only
  const sanitizedUsername = (user.username || `user${user.telegramId}`).toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const stickersSetName = `${sanitizedUsername}_${jobId}_by_${botUsername}`.toLowerCase();
  
  // Stage 6: Upload all videos to Telegram in chunks of 5
  logger.log(`Stage 6: Uploading ${videoPaths.length} videos to Telegram in chunks of 5`);
  const uploadedFiles: Array<{ file_id: string }> = [];
  const chunkSize = 5;
  
  for (let i = 0; i < videoPaths.length; i += chunkSize) {
    const chunk = videoPaths.slice(i, i + chunkSize);
    const chunkNumber = Math.floor(i / chunkSize) + 1;
    const totalChunks = Math.ceil(videoPaths.length / chunkSize);
    
    logger.log(`Uploading chunk ${chunkNumber}/${totalChunks} (${chunk.length} videos)`);
    
    const chunkResults = await Promise.all(
      chunk.map(async (videoPath, chunkIndex) => {
        const globalIndex = i + chunkIndex + 1;
        try {
          logger.debug(`Uploading video ${globalIndex}/${videoPaths.length}: ${videoPath}`);
          const uploadedFile = await uploadStickerFile(user.telegramId, videoPath);
          logger.debug(`Video ${globalIndex} uploaded successfully: ${uploadedFile.file_id}`);
          return uploadedFile;
        } catch (error) {
          logger.error(
            `Failed to upload video ${videoPath}`,
            error instanceof Error ? error.stack : String(error)
          );
          throw error;
        }
      })
    );
    
    uploadedFiles.push(...chunkResults);
    logger.log(`Chunk ${chunkNumber}/${totalChunks} completed: ${chunkResults.length} videos uploaded`);
  }
  
  logger.log(`Stage 6 completed: ${uploadedFiles.length} videos uploaded successfully`);
  
  // Stage 7: Create sticker set
  logger.log(`Stage 7: Creating sticker set "${stickersSetName}"`);
  await bot.telegram.createNewStickerSet(
    user.telegramId,
    stickersSetName,
    `🎥 ${ownerName(user)}'s video stickers`,
    {
      sticker_type: "custom_emoji",
      stickers: [{
        sticker: uploadedFiles[0].file_id,
        emoji_list: ["🎥"],
      }],
      sticker_format: "video",
    }
  );
  logger.log(`Stage 7 completed: Sticker set "${stickersSetName}" created`);
  await new Promise(resolve => setTimeout(resolve, 5000));
  // Stage 8: Add stickers to the set, skipping the first one, we already added it
  logger.log(`Stage 8: Adding ${uploadedFiles.length - 1} stickers to the set`);
  for (let i = 1; i < uploadedFiles.length; i++) {
    const sticker = uploadedFiles[i];
    logger.debug(`Adding sticker ${i + 1}/${uploadedFiles.length} to set`);
    try {
      await bot.telegram.addStickerToSet(
        user.telegramId,
        stickersSetName,
        {
          sticker: {
            sticker: sticker.file_id,
            emoji_list: ["👍"],
          },
        }
      );
      logger.debug(`Sticker ${i + 1} added successfully`);
    } catch (error) {
      logger.error(
        `Failed to add sticker ${i + 1} to set: ${error instanceof Error ? error.message : String(error)}`
      );
      // Log the sticker set name for debugging
      logger.error(`Sticker set name: ${stickersSetName}, User ID: ${user.telegramId}`);
      throw error;
    }
  }
  logger.log(`Stage 8 completed: ${uploadedFiles.length - 1} stickers added to the set`);
  
  // Stage 9: Send the link to the set and a preview of all emoji to the user who created the job
  const targetTelegramId = user.telegramId;
  logger.log(`Stage 9: Sending ${uploadedFiles.length} stickers to Telegram ID ${targetTelegramId}`);
  const stickerSet = await bot.telegram.getStickerSet(stickersSetName);
  const link = `https://t.me/addemoji/${stickersSetName}`;
  let message = `🎥 ${escapeHtml(ownerName(user))}'s video stickers ${link}`;
  message += "\n\n";

  for (let i = 0; i < stickerSet.stickers.length; i++) {
    const sticker = stickerSet.stickers[i];
      message += `<tg-emoji emoji-id="${sticker.custom_emoji_id}">👍</tg-emoji>`;
      if ((i + 1) % 8 === 0) {
        message += "\n";
      }
  }
  try {
    await bot.telegram.sendMessage(targetTelegramId, message, {
      parse_mode: "HTML",
    });
    logger.log(`Stage 9 completed: ${stickerSet.stickers.length} stickers sent to ${targetTelegramId}`);
  } catch (error) {
    logger.error(
      `Stage 9 failed: Failed to send stickers to ${targetTelegramId}`,
      error instanceof Error ? error.stack : String(error)
    );
    // The set is already created: fall back to a plain message with the link only
    await bot.telegram
      .sendMessage(targetTelegramId, `🎥 Your emoji pack is ready: ${link}`)
      .catch((fallbackError: unknown) =>
        logger.error("Failed to send the fallback message", fallbackError instanceof Error ? fallbackError.stack : String(fallbackError)),
      );
  }
  
  logger.log(`Image processing completed successfully for job ${jobId}`);
  return stickersSetName;
};
