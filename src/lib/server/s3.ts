import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const s3 = new S3Client({});

export const CONTENT_IMAGES_BUCKET = process.env.CONTENT_IMAGES_BUCKET!;
export const BUG_REPORT_IMAGES_BUCKET = process.env.BUG_REPORT_IMAGES_BUCKET!;

export function contentImagePublicUrl(key: string): string {
  return `https://${CONTENT_IMAGES_BUCKET}.s3.amazonaws.com/${key}`;
}

export async function uploadObject({
  bucket,
  key,
  body,
  contentType,
  cacheControl,
}: {
  bucket: string;
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  cacheControl?: string;
}): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
    })
  );
}

export async function deleteObject(bucket: string, key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function deleteObjects(
  bucket: string,
  keys: string[]
): Promise<void> {
  if (keys.length === 0) return;
  await s3.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: keys.map((Key) => ({ Key })) },
    })
  );
}

export async function listObjects(
  bucket: string,
  prefix: string
): Promise<string[]> {
  const result = await s3.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix })
  );
  return (result.Contents ?? []).map((obj) => obj.Key!).filter(Boolean);
}

export async function downloadObject(
  bucket: string,
  key: string
): Promise<Buffer> {
  const result = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
  const bytes = await result.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

export async function presignPut(
  bucket: string,
  key: string,
  contentType: string,
  expiresInSeconds = 300
): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: expiresInSeconds }
  );
}

export async function presignGet(
  bucket: string,
  key: string,
  expiresInSeconds: number
): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: expiresInSeconds,
  });
}
