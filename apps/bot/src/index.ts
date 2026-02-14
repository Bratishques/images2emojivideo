import { Elysia } from "elysia";
import { Telegraf, Markup, Context} from "telegraf";
import { Message } from "telegraf/types";
import { env } from "./env";
import { db, users, jobs } from "@emojis-bot/db";
import { eq } from "drizzle-orm";
import { Logger } from "@emojis-bot/logger";
import { userMiddleware } from "./middleware/user.middleware";
import { sendWelcomeMessage } from "./handlers/welcome.handler";
import { createJob } from "./create-job";

const logger = new Logger({ context: "Bot" });

// Interface for photo data
interface PhotoData {
  messageId: number;
  fileId: string;
  width: number;
  height: number;
}

// Object to store timers for media groups
const timers: Record<string, NodeJS.Timeout> = {}
// Object to store photos for media groups
const mediaGroupIdToPhoto: Record<string, PhotoData[]> = {}
// Object to store users for media groups
const mediaGroupIdToUser: Record<string, number> = {}

const app = new Elysia()
  .get("/", () => {
    return { status: "ok", message: "Telegram bot is running" };
  })
  .listen(3000);

// Initialize Telegram Bot with Telegraf
const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

// Register user middleware - runs on every update
bot.use(userMiddleware);


// Handle /start command with interactive buttons
bot.command("start", async (ctx: Context) => {
  // User is already initialized by middleware
  await sendWelcomeMessage(ctx, false);
});
// Handle /help command
bot.command("help", async (ctx: Context) => {
  const helpMessage = `
Available commands:
/start - Start the bot and see main menu
/help - Show this help message

You can also use the interactive buttons below!
  `;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("🔙 Back to Main Menu", "back_to_start")],
  ]);

  await ctx.reply(helpMessage.trim(), keyboard);
});


bot.action("help_info", async (ctx: Context) => {
  await ctx.answerCbQuery();
  const helpMessage = `
📖 Bot Help

This bot helps you process multiple images with emojis.

How to use:
• Send one or more images
• The bot will process them
  `;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("🔙 Back to Main Menu", "back_to_start")],
  ]);

  await ctx.editMessageText(helpMessage.trim(), keyboard);
});

bot.action("settings", async (ctx: Context) => {
  await ctx.answerCbQuery();
  const settingsMessage = `
⚙️ Settings

Here you can configure bot preferences:
• Image quality settings
• Emoji size preferences
• Processing options

Settings panel coming soon!
  `;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("🔙 Back to Main Menu", "back_to_start")],
  ]);

  await ctx.editMessageText(settingsMessage.trim(), keyboard);
});

bot.action("back_to_start", async (ctx: Context) => {
  await ctx.answerCbQuery();
  await sendWelcomeMessage(ctx, true);
});

bot.action("cancel", async (ctx: Context) => {
  await ctx.answerCbQuery("Operation cancelled");
  await ctx.deleteMessage();
});


// Handle photo files messages
bot.on("document", async (ctx: Context) => {
  const message = ctx.message as Message.MediaMessage & Message.DocumentMessage;
  if (!message || !message.document || !ctx.from) return;
  console.log(message);
});


// Handle photo messages
bot.on("photo", async (ctx: Context) => {
  const message = ctx.message as Message.MediaMessage & Message.PhotoMessage;
  if (!message || !message.media_group_id || !ctx.from || !message.photo) return;
  
  const mediaGroupId = message.media_group_id as string;
  const userId = ctx.from.id;
  // Store user ID for this media group
  mediaGroupIdToUser[mediaGroupId] = userId;
  
  // we use the 4th photo in the array because the first one is the smallest and the last one is the largest
  const largestPhoto = message.photo[message.photo.length - 1];
  if (!largestPhoto || !largestPhoto.width || !largestPhoto.height) {
    logger.error(`Missing photo dimensions for media group ${mediaGroupId}`);
    return;
  }
  
  const photoData: PhotoData = {
    messageId: message.message_id,
    fileId: largestPhoto.file_id,
    width: largestPhoto.width,
    height: largestPhoto.height,
  };
  
  const photoArray = mediaGroupIdToPhoto[mediaGroupId] || [];
  photoArray.push(photoData);
  mediaGroupIdToPhoto[mediaGroupId] = photoArray;
  
  if (timers[mediaGroupId]) {
    clearTimeout(timers[mediaGroupId]);
  }
  
  timers[mediaGroupId] = setTimeout(async () => {
    try {
      const photos = mediaGroupIdToPhoto[mediaGroupId];
      const currentUserId = mediaGroupIdToUser[mediaGroupId];
      
      if (!photos || photos.length === 0 || !currentUserId) {
        return;
      }
      
      // Sort photos by message_id in ascending order
      photos.sort((a, b) => a.messageId - b.messageId);
      
      // Check aspect ratio for all photos
      const firstAspectRatio = photos[0].width / photos[0].height;
      const aspectRatiosMatch = photos.every((photo) => {
        const aspectRatio = photo.width / photo.height;
        // Use small epsilon for floating point comparison
        return Math.abs(aspectRatio - firstAspectRatio) < 0.0001;
      });
      
      if (!aspectRatiosMatch) {
        const aspectRatios = photos.map(p => `${p.width}/${p.height} (${(p.width / p.height).toFixed(4)})`).join(", ");
        logger.error(
          `Aspect ratio mismatch for media group ${mediaGroupId}. ` +
          `Aspect ratios: ${aspectRatios}`
        );
        
        await bot.telegram.sendMessage(
          currentUserId,
          "Ошибка: все изображения должны иметь одинаковое соотношение сторон. Пожалуйста, отправьте изображения с одинаковым aspect ratio."
        );
        
        // Cleanup
        delete mediaGroupIdToPhoto[mediaGroupId];
        delete mediaGroupIdToUser[mediaGroupId];
        delete timers[mediaGroupId];
        return;
      }
      
      // Extract file IDs in sorted order
      const fileIds = photos.map(photo => photo.fileId);
      
      await createJob(mediaGroupId, fileIds, currentUserId);
      await bot.telegram.sendMessage(currentUserId, "Your job has been created. Please wait for it to be processed.");
      
      // Cleanup
      delete mediaGroupIdToPhoto[mediaGroupId];
      delete mediaGroupIdToUser[mediaGroupId];
      delete timers[mediaGroupId];
    } catch (error) {
      logger.error(
        `Error processing media group ${mediaGroupId}`,
        error instanceof Error ? error.stack : String(error)
      );
      
      const userId = mediaGroupIdToUser[mediaGroupId];
      if (userId) {
        try {
          await bot.telegram.sendMessage(userId, "Произошла ошибка при обработке изображений. Пожалуйста, попробуйте еще раз.");
        } catch (sendError) {
          logger.error("Failed to send error message to user", sendError instanceof Error ? sendError.stack : String(sendError));
        }
      }
      
      // Cleanup on error
      delete mediaGroupIdToPhoto[mediaGroupId];
      delete mediaGroupIdToUser[mediaGroupId];
      delete timers[mediaGroupId];
    }
  }, 2000);
});



// Handle text messages
bot.on("text", async (ctx: Context) => {
  const message = ctx.message as Message.TextMessage;
  const text = message?.text;
  if (!text) return;
  
  if (!text.startsWith("/")) {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("📸 Send Images", "send_images")],
      [Markup.button.callback("ℹ️ Help", "help_info")],
    ]);

    await ctx.reply(
      `You said: ${text}\n\nUse the buttons below to interact with the bot!`,
      keyboard
    );
  }
});

// Error handling
bot.catch((err: unknown, ctx: Context) => {
  logger.error(`Error handling ${ctx.updateType}`, err instanceof Error ? err.stack : String(err));
  ctx.reply("An error occurred. Please try again later.");
});

// Start the bot
bot.launch().then(() => {
  logger.log("Telegram bot initialized and polling");
}).catch((err: unknown) => {
  logger.error("Failed to start bot", err instanceof Error ? err.stack : String(err));
  process.exit(1);
});

// Graceful shutdown
process.once("SIGINT", () => {
  logger.warn("Received SIGINT, shutting down gracefully...");
  bot.stop("SIGINT");
  process.exit(0);
});

process.once("SIGTERM", () => {
  logger.warn("Received SIGTERM, shutting down gracefully...");
  bot.stop("SIGTERM");
  process.exit(0);
});

logger.log("Elysia server is running at http://localhost:3000");

