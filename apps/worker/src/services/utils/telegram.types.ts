/**
 * Telegram File object from getFile API response
 */
export interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path: string;
}

/**
 * Telegram API response for getFile endpoint
 */
export interface TelegramGetFileResponse {
  ok: boolean;
  result: TelegramFile;
}

/**
 * Telegram API response for uploadStickerFile endpoint
 */
export interface TelegramUploadStickerFileResponse {
  ok: boolean;
  result: {
    file_id: string;
  };
}

/**
 * Generic Telegram API response
 */
export interface TelegramApiResponse<T = any> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

