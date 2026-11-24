import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import sharp from "sharp";
import { splitImageIntoGrid } from "../src/services/utils/image-grid";
import { createVideosFromPieces } from "../src/services/utils/video";

// Encoding needs ffmpeg with libvpx-vp9; the test is skipped where ffmpeg is not installed.
const hasFfmpeg = Bun.which("ffmpeg") !== null && Bun.which("ffprobe") !== null;

// Telegram requirements for video custom emoji: WebM/VP9, 100x100 px, up to 3 s, up to 256 KB
const MAX_STICKER_BYTES = 256 * 1024;

describe.skipIf(!hasFfmpeg)("createVideosFromPieces", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "emoji-video-"));
    process.env.WORKER_TEMP_DIR = dir;
  });

  afterAll(async () => {
    delete process.env.WORKER_TEMP_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  test("turns a 2x2 grid of three frames into four 100x100 VP9 clips", async () => {
    const colors = ["#ff0000", "#00ff00", "#0000ff"];
    for (let i = 0; i < colors.length; i++) {
      const frame = path.join(dir, `frame-${i}.png`);
      await sharp({ create: { width: 200, height: 200, channels: 3, background: colors[i] } }).png().toFile(frame);
      await splitImageIntoGrid(frame, 7, i, 2, 2);
    }

    const videos = await createVideosFromPieces(7, colors.length, 2, 2);
    expect(videos.map((v) => path.basename(v))).toEqual(["7-0-0.webm", "7-0-1.webm", "7-1-0.webm", "7-1-1.webm"]);

    for (const video of videos) {
      const probe = Bun.spawnSync([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=codec_name,width,height:format=duration",
        "-of", "json", video,
      ]);
      const info = JSON.parse(probe.stdout.toString());
      expect(info.streams[0]).toMatchObject({ codec_name: "vp9", width: 100, height: 100 });
      expect(Number(info.format.duration)).toBeLessThanOrEqual(3.05);
      expect((await stat(video)).size).toBeLessThanOrEqual(MAX_STICKER_BYTES);
    }
  });
});
