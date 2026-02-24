import sharp from 'sharp';
import logger from '../utils/logger.js';

export class ImageCompressionService {
  /**
   * Compress and resize images larger than 4MB.
   * Target: 3-4MB per image at 80% quality.
   */
  static async processImage(buffer: Buffer, filename: string): Promise<Buffer> {
    const sizeMB = buffer.length / (1024 * 1024);

    try {
      const metadata = await sharp(buffer).metadata();
      logger.info('Processing image', {
        filename,
        originalSize: `${sizeMB.toFixed(2)}MB`,
        resolution: metadata.width && metadata.height ? `${metadata.width}x${metadata.height}` : 'unknown',
        format: metadata.format,
      });
    } catch (error) {
      logger.warn('Failed to read image metadata', { filename, error: String(error) });
    }

    if (sizeMB <= 4) {
      return buffer;
    }

    const compressed = await sharp(buffer)
      .resize(1920, 1080, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 80,
        progressive: true,
        mozjpeg: true,
      })
      .toBuffer();

    const compressedSizeMB = compressed.length / (1024 * 1024);
    logger.info('Image compressed', {
      filename,
      originalSize: `${sizeMB.toFixed(2)}MB`,
      compressedSize: `${compressedSizeMB.toFixed(2)}MB`,
      reduction: `${((1 - compressedSizeMB / sizeMB) * 100).toFixed(1)}%`,
    });

    return compressed;
  }

  static async processImages(
    images: Array<{ buffer: Buffer; filename: string }>
  ): Promise<Array<{ buffer: Buffer; filename: string }>> {
    return Promise.all(
      images.map(async (img) => ({
        filename: img.filename,
        buffer: await this.processImage(img.buffer, img.filename),
      }))
    );
  }
}

export default ImageCompressionService;
