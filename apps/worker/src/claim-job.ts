import { db, jobs, users } from "@emojis-bot/db";
import { and, asc, eq } from "drizzle-orm";

/**
 * Atomically moves the oldest pending job to "processing".
 * The status condition in the UPDATE makes the claim safe when several
 * worker instances poll the same table: only one of them gets the row.
 */
export async function claimNextJob() {
  const [candidate] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.status, "pending"))
    .orderBy(asc(jobs.id))
    .limit(1);
  if (!candidate) return null;

  const [claimed] = await db
    .update(jobs)
    .set({ status: "processing", updatedAt: new Date() })
    .where(and(eq(jobs.id, candidate.id), eq(jobs.status, "pending")))
    .returning();
  if (!claimed) return null; // taken by another worker in the meantime

  const [user] = await db.select().from(users).where(eq(users.id, claimed.userId)).limit(1);
  return { job: claimed, user };
}
