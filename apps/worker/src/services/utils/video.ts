import { writeFile, readdir, unlink } from "fs/promises";
import path from "path";
import { Logger } from "@emojis-bot/logger";
import { spawn } from "child_process";
import { getTempDir } from "./file-utils";

const logger = new Logger({ context: "Video" });

/**
 * Groups image pieces by their grid position (row, col)
 */
const groupPiecesByPosition = async (
  jobId: number,
  numImages: number,
  rows: number,
  cols: number
): Promise<Map<string, string[]>> => {
  const tempDir = getTempDir();
  const files = await readdir(tempDir);
  
  // Filter files that match the pattern ${jobId}-${imageIndex}-${row}-${col}.png
  const pattern = new RegExp(`^${jobId}-(\\d+)-(\\d+)-(\\d+)\\.png$`);
  const pieces = files
    .filter(file => pattern.test(file))
    .map(file => {
      const match = file.match(pattern);
      if (!match) return null;
      return {
        file,
        imageIndex: parseInt(match[1], 10),
        row: parseInt(match[2], 10),
        col: parseInt(match[3], 10),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  
  // Group by position (row, col)
  const grouped = new Map<string, string[]>();
  
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const key = `${row}-${col}`;
      const positionPieces = pieces
        .filter(p => p.row === row && p.col === col)
        .sort((a, b) => a.imageIndex - b.imageIndex) // Sort by imageIndex
        .map(p => path.join(tempDir, p.file));
      
      grouped.set(key, positionPieces);
    }
  }
  
  return grouped;
};

/**
 * Creates a video from a sequence of images using ffmpeg
 */
const createVideoFromImages = async (
  imagePaths: string[],
  outputPath: string,
  frameRate: number = 24,
  totalFrames: number = 72
): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (imagePaths.length === 0) {
      reject(new Error("No images provided for video creation"));
      return;
    }
    
    // Use ffmpeg concat demuxer for better control over frame duration
    // Create a temporary file list for concat demuxer
    const listPath = outputPath.replace('.webm', '_list.txt');
    
    // Calculate frames per image (divide total frames equally)
    const framesPerImage = Math.floor(totalFrames / imagePaths.length);
    const remainingFrames = totalFrames % imagePaths.length;
    const frameDuration = 1 / frameRate; // Duration of one frame in seconds
    
    // Format: file 'path'\nduration seconds
    // Each image gets equal number of frames
    const listContent = imagePaths
      .map((imgPath, index) => {
        // Escape single quotes in path for concat file format
        const escapedPath = imgPath.replace(/'/g, "'\\''");
        // Last images get extra frames if there's a remainder
        const framesForThisImage = framesPerImage + (index >= imagePaths.length - remainingFrames ? 1 : 0);
        const duration = framesForThisImage * frameDuration;
        return `file '${escapedPath}'\nduration ${duration}`;
      })
      .join('\n');
    
    writeFile(listPath, listContent)
      .then(() => {
        const totalDuration = totalFrames / frameRate; // Total duration in seconds (72/24 = 3 seconds)
        
        const ffmpeg = spawn('ffmpeg', [
          '-f', 'concat',
          '-safe', '0',
          '-i', listPath,
          '-vf', 'scale=100:100', // Force exact 100x100 dimensions
          '-c:v', 'libvpx-vp9', // WebM codec
          '-pix_fmt', 'yuv420p',
          '-r', frameRate.toString(), // Set frame rate
          '-t', totalDuration.toString(), // Limit video duration
          '-y', // Overwrite output file
          outputPath,
        ]);
        
        let stderr = '';
        
        ffmpeg.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        ffmpeg.on('close', async (code) => {
          // Clean up list file
          try {
            await unlink(listPath);
          } catch (cleanupError) {
            // Ignore cleanup errors
          }
          
          if (code === 0) {
            logger.debug(`Video created: ${outputPath}`);
            resolve(outputPath);
          } else {
            logger.error(`FFmpeg error: ${stderr}`);
            reject(new Error(`FFmpeg process exited with code ${code}: ${stderr}`));
          }
        });
        
        ffmpeg.on('error', async (error) => {
          // Clean up list file on error
          try {
            await unlink(listPath);
          } catch (cleanupError) {
            // Ignore cleanup errors
          }
          reject(new Error(`Failed to start ffmpeg: ${error.message}`));
        });
      })
      .catch(reject);
  });
};

/**
 * Creates videos from all grid pieces
 * Returns array of video file paths
 */
export const createVideosFromPieces = async (
  jobId: number,
  numImages: number,
  rows: number,
  cols: number
): Promise<string[]> => {
  const grouped = await groupPiecesByPosition(jobId, numImages, rows, cols);
  const tempDir = getTempDir();
  const videoPaths: string[] = [];
  
  // Create video for each position
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const key = `${row}-${col}`;
      const imagePaths = grouped.get(key);
      
      if (!imagePaths || imagePaths.length === 0) {
        logger.warn(`No images found for position (${row}, ${col})`);
        continue;
      }
      
      const videoPath = path.join(tempDir, `${jobId}-${row}-${col}.webm`);
      
      try {
        await createVideoFromImages(imagePaths, videoPath, 24, 72); // 24 fps, 72 total frames (3 seconds)
        videoPaths.push(videoPath);
        logger.debug(`Created video for position (${row}, ${col}): ${videoPath}`);
      } catch (error) {
        logger.error(
          `Failed to create video for position (${row}, ${col})`,
          error instanceof Error ? error.stack : String(error)
        );
        throw error;
      }
    }
  }
  
  return videoPaths;
};

