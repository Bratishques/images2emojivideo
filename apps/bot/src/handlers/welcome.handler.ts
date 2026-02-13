import { Context } from "telegraf";
import { Markup } from "telegraf";

/**
 * Welcome message content
 */
const welcomeMessage = `
Hello! I'm the Emojis Multiple Images Bot.
I can help you create multiple images with emojis.
To get started, send me a message with multiple images you want to be made into emojis.
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

