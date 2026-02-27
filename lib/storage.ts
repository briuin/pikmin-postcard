import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;

export type StorageConfig = {
  bucket: string;
  region: string;
  baseUrl: string;
};

function sanitizeFileName(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
}

export function buildObjectKey(originalName: string): string {
  const now = new Date();
  const datePrefix = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  const safeName = sanitizeFileName(originalName || 'postcard-image.jpg');
  return `postcards/${datePrefix}/${crypto.randomUUID()}-${safeName}`;
}

export function buildVariantObjectKey(baseKey: string, variant: 'original' | 'postcard'): string {
  if (variant === 'original') {
    return baseKey.replace(/^postcards\//, 'uploads/original/');
  }

  return baseKey.replace(/^postcards\//, 'uploads/postcard/');
}

export function getStorageConfig(): StorageConfig {
  const bucket = process.env.S3_BUCKET_NAME;
  const region = process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1';
  const publicBase = process.env.S3_PUBLIC_BASE_URL;

  if (!bucket) {
    throw new Error('Missing S3_BUCKET_NAME.');
  }

  return {
    bucket,
    region,
    baseUrl: publicBase || `https://${bucket}.s3.${region}.amazonaws.com`
  };
}

export function assertSupportedImage(file: File): void {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image uploads are supported.');
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('Image exceeds max size of 8MB.');
  }
}

export async function uploadBytesToStorage(params: {
  key: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<string> {
  const config = getStorageConfig();
  const s3 = new S3Client({ region: config.region });

  await s3.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: params.key,
      Body: params.bytes,
      ContentType: params.contentType,
      CacheControl: 'public,max-age=31536000,immutable'
    })
  );

  return `${config.baseUrl}/${params.key}`;
}
