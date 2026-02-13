import { pgTable, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { users } from "./users";
import { packs } from "./packs";

export const jobStatusEnum = pgEnum("job_status", ["pending", "processing", "completed", "failed"]);

export const jobs = pgTable("jobs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  packId: integer("pack_id").references(() => packs.id, { onDelete: "set null" }),
  status: jobStatusEnum("status").notNull().default("pending"),
  fileIds: text("file_ids").notNull(), // JSON array of Telegram file IDs
  resultFileId: text("result_file_id"), // Telegram file ID of the result
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  mediaGroupId: text("media_group_id").notNull().unique(),
});

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;

