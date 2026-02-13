import { Context } from "telegraf";
import { db, users } from "@emojis-bot/db";
import { eq } from "drizzle-orm";
import { Logger } from "@emojis-bot/logger";

const logger = new Logger({ context: "UserMiddleware" });

/**
 * Middleware to automatically initialize and save users to the database
 * Runs on every update that contains user information
 */
export async function userMiddleware(ctx: Context, next: () => Promise<void>) {
  // Only process updates that have user information
  if (!ctx.from) {
    return next();
  }

  const telegramId = ctx.from.id;
  const username = ctx.from.username;
  const firstName = ctx.from.first_name;
  const lastName = ctx.from.last_name;

  try {
    // Check if user exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .limit(1);

    if (existingUser.length > 0) {
      // Update user info if it has changed
      const user = existingUser[0];
      const needsUpdate =
        user.username !== username ||
        user.firstName !== firstName ||
        user.lastName !== lastName;

      if (needsUpdate) {
        await db
          .update(users)
          .set({
            username: username || user.username,
            firstName: firstName || user.firstName,
            lastName: lastName || user.lastName,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));

        logger.debug(`Updated user info for telegramId: ${telegramId}`);
      }
    } else {
      // Create new user
      const [newUser] = await db
        .insert(users)
        .values({
          telegramId,
          username,
          firstName,
          lastName,
        })
        .returning();

      logger.log(`Created new user: telegramId=${telegramId}, username=${username || "N/A"}`);
    }
  } catch (error) {
    logger.error(
      `Error initializing user ${telegramId}`,
      error instanceof Error ? error.stack : String(error)
    );
    // Continue execution even if user initialization fails
  }

  return next();
}

