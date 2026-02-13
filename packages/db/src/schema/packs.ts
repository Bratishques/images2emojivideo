import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

export const packs = pgTable("packs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Pack = typeof packs.$inferSelect;
export type NewPack = typeof packs.$inferInsert;

