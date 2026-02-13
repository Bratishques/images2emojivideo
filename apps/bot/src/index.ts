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

// Object to store timers for media groups
const timers: Record<string, NodeJS.Timeout> = {}
// Object to store photos for media groups
const mediaGroupIdToPhoto: Record<string, string[]> = {}
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

// Store file IDs temporarily for batch processing
const pendingImages = new Map<number, string[]>();

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
  const photoArray = mediaGroupIdToPhoto[message.media_group_id as string] || [];
  // we use the 4th photo in the array because the first one is the smallest and the last one is the largest
  photoArray.push(message.photo[3].file_id);
  mediaGroupIdToPhoto[message.media_group_id] = photoArray;
  if (timers[message.media_group_id]) {
    clearTimeout(timers[message.media_group_id]);
  }
  timers[message.media_group_id] = setTimeout(async () => {
    const photoArray = mediaGroupIdToPhoto[message.media_group_id as string];
    await createJob(message.media_group_id as string, photoArray, ctx.from?.id as number);
    await bot.telegram.sendMessage(ctx.from?.id as number, "Your job has been created. Please wait for it to be processed.");
  }, 2000);
  // try {
  //   await createJob(message.media_group_id, message.photo.map(photo => photo.file_id), ctx.from.id);
  // } catch (error) {
  //   // Errors are awaited because telegram sends multiple messages in a single update
  // }
});



// Handle text messages
bot.on("text", async (ctx: Context) => {
  const text = ctx.message?.text;
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

