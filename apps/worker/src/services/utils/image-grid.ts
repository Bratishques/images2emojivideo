import path from "path";
import { Logger } from "@emojis-bot/logger";
import sharp from "sharp";

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
 * Calculates grid size based on aspect ratio
 * Maximum horizontal size is 8
 * Returns { cols, rows } where cols <= 8
 */
export const calculateGridSize = (aspectRatio: number): { cols: number; rows: number } => {
  // Start with maximum columns (8)
  let cols = 8;
  let rows = Math.round(cols / aspectRatio);
  
  // If rows would be less than 1, adjust
  if (rows < 1) {
    rows = 1;
    cols = Math.round(rows * aspectRatio);
    // Ensure cols doesn't exceed 8
    if (cols > 8) {
      cols = 8;
      rows = Math.round(cols / aspectRatio);
    }
  }
  
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
  const tempDir = path.join(process.cwd(), 'temp');
  
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

