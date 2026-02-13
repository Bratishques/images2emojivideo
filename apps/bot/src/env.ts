import { z } from "zod";

// Bun automatically loads .env files from the workspace root
// This file validates and exports environment variables using Zod

// Define environment variable schema
const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL connection string"),
});

// Get environment variables (Bun.env or process.env)
const getEnv = () => {
  if (typeof Bun !== "undefined" && Bun.env) {
    return Bun.env;
  }
  return process.env;
};

// Validate environment variables
const parseResult = envSchema.safeParse(getEnv());

if (!parseResult.success) {
  const errors = parseResult.error.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join("\n");
  throw new Error(`Environment variable validation failed:\n${errors}`);
}

export const env = parseResult.data;

