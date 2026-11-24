/**
 * Runs the image -> video emoji part of the pipeline on local files,
 * without Telegram and without a database.
 *
 * Usage (from the repository root):
 *   bun run preview -- <frame1> <frame2> [...frameN] [--out <dir>]
 *
 * Writes one <row>-<col>.webm per grid cell into the output directory
 * (default: ./preview-output) and a mosaic.webm that plays all cells
 * side by side, so the result can be checked before uploading to Telegram.
 */
import { mkdir, readdir, rename, rm } from "fs/promises";
import path from "path";
import { calculateGridSize, getImageDimensions, splitImageIntoGrid } from "../src/services/utils/image-grid";
import { createVideosFromPieces } from "../src/services/utils/video";

const JOB_ID = 0;
const GAP_PX = 4;

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outDir = path.resolve(process.env.INIT_CWD ?? process.cwd(), outIndex >= 0 ? args[outIndex + 1] : "preview-output");
const frames = args
  .filter((_, i) => i !== outIndex && i !== outIndex + 1)
  .map((frame) => path.resolve(process.env.INIT_CWD ?? process.cwd(), frame));

if (frames.length === 0 || (outIndex >= 0 && !args[outIndex + 1])) {
  console.error("Usage: bun run preview -- <frame1> <frame2> [...frameN] [--out <dir>]");
  process.exit(1);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
process.env.WORKER_TEMP_DIR = outDir;

const { width, height } = await getImageDimensions(frames[0]);
for (const frame of frames.slice(1)) {
  const size = await getImageDimensions(frame);
  if (Math.abs(size.width / size.height - width / height) > 0.0001) {
    console.error(`Aspect ratio of ${frame} (${size.width}x${size.height}) differs from the first frame (${width}x${height})`);
    process.exit(1);
  }
}

const { cols, rows } = calculateGridSize(width / height);
console.log(`${frames.length} frames, ${width}x${height} -> grid ${cols}x${rows} (${cols * rows} emoji)`);

for (let i = 0; i < frames.length; i++) {
  await splitImageIntoGrid(frames[i], JOB_ID, i, cols, rows);
}
const videos = await createVideosFromPieces(JOB_ID, frames.length, rows, cols);

// Drop the intermediate pieces and strip the job id prefix from the clip names
for (const file of await readdir(outDir)) {
  if (file.endsWith(".png")) await rm(path.join(outDir, file));
}
const clips = await Promise.all(
  videos.map(async (video) => {
    const target = path.join(outDir, path.basename(video).replace(`${JOB_ID}-`, ""));
    await rename(video, target);
    return target;
  }),
);

// Mosaic: all clips laid out in the grid with a small gap, to see the emoji as they appear in a message
const cell = 100 + GAP_PX;
const layout = clips.map((_, i) => `${(i % cols) * cell}_${Math.floor(i / cols) * cell}`).join("|");
const inputs = clips.flatMap((clip) => ["-i", clip]);
const mosaicPath = path.join(outDir, "mosaic.webm");
const ffmpeg = Bun.spawnSync([
  "ffmpeg", "-v", "error", "-y", ...inputs,
  "-filter_complex", `${clips.map((_, i) => `[${i}:v]`).join("")}xstack=inputs=${clips.length}:layout=${layout}:fill=white[v]`,
  "-map", "[v]", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32", mosaicPath,
]);
if (ffmpeg.exitCode !== 0) {
  console.error(`Failed to build mosaic: ${ffmpeg.stderr.toString()}`);
  process.exit(1);
}

console.log(`Wrote ${clips.length} clips and mosaic.webm to ${outDir}`);
