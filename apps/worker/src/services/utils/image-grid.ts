import path from "path";
import { Logger } from "@emojis-bot/logger";
import sharp from "sharp";
import { ensureDirectoryExists, getTempDir } from "./file-utils";

const logger = new Logger({ context: "ImageGrid" });

/**
 * Gets image dimensions
 */
export const getImageDimensions = async (imagePath: string): Promise<{ width: number; height: number }> => {
  const metadata = await sharp(imagePath).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Failed to get dimensions for image ${imagePath}`);
  }
  return { width: metadata.width, height: metadata.height };
};

/**
 * Calculates grid size based on aspect ratio.
 * The grid is always 8 cells wide (the result message lays the emoji out in rows of 8);
 * the number of rows keeps the cells close to square and is at least 1.
 */
export const calculateGridSize = (aspectRatio: number): { cols: number; rows: number } => {
  const cols = 8;
  const rows = Math.max(1, Math.round(cols / aspectRatio));
  return { cols, rows };
};

/**
 * Splits an image into grid pieces
 */
export const splitImageIntoGrid = async (
  imagePath: string,
  jobId: number,
  imageIndex: number,
  cols: number,
  rows: number
): Promise<string[]> => {
  const metadata = await sharp(imagePath).metadata();
  
  if (!metadata.width || !metadata.height) {
    throw new Error(`Failed to get dimensions for image ${imagePath}`);
  }
  
  const width = metadata.width;
  const height = metadata.height;
  const pieceWidth = Math.floor(width / cols);
  const pieceHeight = Math.floor(height / rows);
  
  const pieces: string[] = [];
  const tempDir = getTempDir();
  await ensureDirectoryExists(tempDir);
  
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const left = col * pieceWidth;
      const top = row * pieceHeight;
      
      const piecePath = path.join(tempDir, `${jobId}-${imageIndex}-${row}-${col}.png`);
      
      // Create a new sharp instance for each extraction
      await sharp(imagePath)
        .extract({
          left,
          top,
          width: pieceWidth,
          height: pieceHeight,
        })
        .toFile(piecePath);
      
      pieces.push(piecePath);
      logger.debug(`Created piece ${piecePath} (${pieceWidth}x${pieceHeight})`);
    }
  }
  
  return pieces;
};

