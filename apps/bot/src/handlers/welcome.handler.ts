import { Context } from "telegraf";
import { Markup } from "telegraf";

/**
 * Welcome message content
 */
const welcomeMessage = `
Hello! I turn a sequence of photos into an animated custom emoji pack.
Send me 2–10 photos with the same aspect ratio as one album. Each photo becomes a frame of the animation.
`;

/**
 * Welcome keyboard buttons
 */
const welcomeKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("ℹ️ Help", "help_info")],
]);

/**
 * Sends the welcome message to the user
 * Can be used for both new messages (reply) and editing existing messages (editMessageText)
 */
export async function sendWelcomeMessage(ctx: Context, useEdit: boolean = false): Promise<void> {
  const message = welcomeMessage.trim();
  const keyboard = welcomeKeyboard;

  if (useEdit) {
    await ctx.editMessageText(message, keyboard);
  } else {
    await ctx.reply(message, keyboard);
  }
}

