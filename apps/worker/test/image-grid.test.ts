import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import sharp from "sharp";
import { calculateGridSize, getImageDimensions, splitImageIntoGrid } from "../src/services/utils/image-grid";

describe("calculateGridSize", () => {
  test("square image gives an 8x8 grid", () => {
    expect(calculateGridSize(1)).toEqual({ cols: 8, rows: 8 });
  });

  test("landscape 16:9 image keeps 8 columns and fewer rows", () => {
    expect(calculateGridSize(16 / 9)).toEqual({ cols: 8, rows: 5 });
  });

  test("portrait 9:16 image keeps 8 columns and more rows", () => {
    expect(calculateGridSize(9 / 16)).toEqual({ cols: 8, rows: 14 });
  });

  test("very wide image still gets one row of 8 columns", () => {
    const { cols, rows } = calculateGridSize(40);
    expect(rows).toBe(1);
    expect(cols).toBe(8);
  });
});

describe("splitImageIntoGrid", () => {
  let dir: string;
  let imagePath: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "emoji-grid-"));
    process.env.WORKER_TEMP_DIR = dir;
    imagePath = path.join(dir, "source.png");
    await sharp({ create: { width: 400, height: 225, channels: 3, background: "#3366cc" } }).png().toFile(imagePath);
  });

  afterAll(async () => {
    delete process.env.WORKER_TEMP_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  test("cuts the image into cols x rows pieces of equal size", async () => {
    const { width, height } = await getImageDimensions(imagePath);
    const { cols, rows } = calculateGridSize(width / height);
    const pieces = await splitImageIntoGrid(imagePath, 1, 0, cols, rows);

    expect(pieces).toHaveLength(cols * rows);
    expect(path.basename(pieces[0])).toBe("1-0-0-0.png");
    expect(path.basename(pieces[pieces.length - 1])).toBe(`1-0-${rows - 1}-${cols - 1}.png`);

    const piece = await sharp(pieces[0]).metadata();
    expect(piece.width).toBe(Math.floor(width / cols));
    expect(piece.height).toBe(Math.floor(height / rows));
  });
});
