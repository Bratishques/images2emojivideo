import { db, jobs, users } from "@emojis-bot/db";
import { eq } from "drizzle-orm";

export const createJob = async (mediaGroupId: string, fileIds: string[], telegramUserId: number) => {
  const user = await db.select().from(users).where(eq(users.telegramId, telegramUserId)).limit(1);
  if (user.length === 0) {
    throw new Error("User not found");
  }
  const jobExists = await db.select().from(jobs).where(eq(jobs.mediaGroupId, mediaGroupId)).limit(1);
  if (jobExists.length > 0) {
    throw new Error("Job already exists");
  }
  const job = await db.insert(jobs).values({
    userId: user[0].id,
    fileIds: JSON.stringify(fileIds),
    status: "pending",
    mediaGroupId: mediaGroupId,
  });
  return job;
};