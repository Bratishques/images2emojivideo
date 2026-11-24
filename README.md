# images2emojivideo

[![CI](https://github.com/Bratishques/images2emojivideo/actions/workflows/ci.yml/badge.svg)](https://github.com/Bratishques/images2emojivideo/actions/workflows/ci.yml)

A Telegram bot that turns a short sequence of photos into an **animated custom emoji pack**.
You send an album of 2–10 photos; every photo becomes a frame. Each frame is cut into a grid
8 cells wide, and every cell becomes a 3-second looping video emoji. Put together in a message,
the emoji show the whole animation as a mosaic.

## Example

Input: six frames (800×800 PNG), sent as one album.

![Input frames](docs/input-frames.png)

Output: an 8×8 grid of 64 video emoji (each 100×100 px, VP9 WebM, 3 s).
The GIF below is the mosaic produced by the local preview script (`bun run preview`),
not a screenshot from Telegram; the white lines are the borders between individual emoji.

![Resulting emoji grid](docs/result-mosaic.gif)

## How it works

```
Telegram ──album──▶ bot ──job row──▶ PostgreSQL ◀──poll── worker ──▶ Telegram Bot API
                                                            │
                                         sharp: split frames into a grid
                                         ffmpeg: one VP9 clip per grid cell
```

1. **Bot** (`apps/bot`, Telegraf). Photos of one album arrive as separate updates, so the bot
   buffers them by `media_group_id` and waits 2 seconds after the last one. It checks that all
   frames have the same aspect ratio and stores a `pending` job with the Telegram file IDs.
2. **Worker** (`apps/worker`) polls the `jobs` table every 5 seconds and claims one job with a
   conditional `UPDATE … WHERE status = 'pending'`, so two worker instances cannot take the same job.
3. Processing of a job:
   - download the frames from Telegram;
   - choose the grid: 8 columns, `round(8 / aspectRatio)` rows (at least 1), so cells are close to square;
   - cut every frame into cells with **sharp**;
   - for every cell position, build a clip from that cell across all frames with **ffmpeg**
     (concat demuxer, 72 frames at 24 fps split evenly between the photos, scaled to 100×100, `libvpx-vp9`);
   - upload the clips with `uploadStickerFile`, create a `custom_emoji` sticker set with the first one
     and add the rest with `addStickerToSet`;
   - send the user a link `t.me/addemoji/<set>` and a message with all emoji laid out in rows of 8
     (if Telegram rejects the emoji message, a plain message with the link is sent instead);
   - mark the job `completed` (or `failed` with the error message) and delete the temporary files.

## Stack

- [Bun](https://bun.sh) runtime, TypeScript, [Turborepo](https://turbo.build) monorepo
- [Telegraf](https://telegraf.js.org) for the Telegram Bot API, [Elysia](https://elysiajs.com) for a health-check endpoint
- PostgreSQL with [Drizzle ORM](https://orm.drizzle.team), environment validation with [zod](https://zod.dev)
- [sharp](https://sharp.pixelplumbing.com) for image slicing, [ffmpeg](https://ffmpeg.org) (libvpx-vp9) for encoding

```
apps/bot          Telegram bot: commands, album buffering, job creation, GET / health check on :3000
apps/worker       job polling and the image → video emoji pipeline
  scripts/        preview.ts: run the pipeline on local files without Telegram
  test/           bun tests for grid slicing and video encoding
packages/db       Drizzle schema (users, jobs, packs) and the database client
packages/logger   small colored console logger
```

## Running locally

Requirements: Bun 1.4+, ffmpeg with libvpx-vp9 on `PATH`, Docker (for PostgreSQL) and a bot token from [@BotFather](https://t.me/BotFather).

```bash
bun install
cp .env.example .env              # set TELEGRAM_BOT_TOKEN
docker compose up -d postgres     # PostgreSQL on localhost:5432
bun run db:push                   # create the tables from the Drizzle schema

bun run dev:bot                   # terminal 1
bun run dev:worker                # terminal 2
```

The package scripts read the root `.env` (`bun --env-file=../../.env`). Then open the bot in
Telegram, send `/start` and an album of photos with the same aspect ratio.

### Trying the pipeline without Telegram

```bash
bun run preview -- frame1.png frame2.png frame3.png --out preview-output
```

This writes one `<row>-<col>.webm` per grid cell and a `mosaic.webm` with all cells side by side.
It needs only ffmpeg, no database or bot token.

### Checks

```bash
bun run typecheck   # tsc --noEmit in every package
bun run test        # bun test in apps/worker; the video test is skipped if ffmpeg is not installed
bun run build       # bun build for the bot and the worker
```

The same checks run in GitHub Actions on every pull request and on pushes to `master`.

## Status and limitations

This is a pet project. What is verified and what is not:

- Verified: type checking, unit tests, grid slicing and VP9 encoding (100×100, 3 s, well under the 256 KB sticker limit on the sample above),
  the local preview, the database schema and the job claim against PostgreSQL 17.
- Not re-verified after the 2026 cleanup: the Telegram part (uploading clips, creating the sticker set,
  sending the result). It needs a real bot token and an end-to-end run.

Known limitations:

- The album buffer lives in the bot's memory, so the bot must run as a single instance.
- A job stays `processing` if the worker crashes in the middle; there is no lease or retry.
- The user is not notified when a job fails; the reason is only stored in `jobs.error_message`.
- A custom emoji set holds at most 200 emoji, so frames taller than about 1:3 (more than 25 rows) will fail.
- Frames are taken from Telegram's compressed photos (up to 1280 px), not from the original files.
- Cells of very wide images are not square and get stretched to 100×100.
- Single photos and files sent as documents are not processed.

## Possible improvements

- Notify the user about failed jobs and add a timeout for jobs stuck in `processing`.
- Validate the grid size against the 200-emoji limit before creating the job.
- Accept files sent as documents to avoid Telegram's compression.
- Move the album buffer to the database or Redis to allow several bot instances.
- Use the `packs` table (already in the schema) to list a user's packs.

## License

[MIT](LICENSE) © Viktor Nikulin
