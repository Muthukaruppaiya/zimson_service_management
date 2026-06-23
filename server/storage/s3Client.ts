import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Bucket, s3KeyPrefix, s3Region } from "./config";

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: s3Region(),
      credentials:
        process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim()
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID.trim(),
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY.trim(),
            }
          : undefined,
    });
  }
  return client;
}

export function fullS3Key(relativeKey: string): string {
  const rel = relativeKey.replace(/^\/+/, "");
  const prefix = s3KeyPrefix();
  if (!prefix) return rel;
  return rel.startsWith(`${prefix}/`) ? rel : `${prefix}/${rel}`;
}

/** Older uploads (empty AWS_S3_PREFIX bug) stored keys like `/service-photos/file.png`. */
export function legacyLeadingSlashS3Key(canonicalKey: string): string {
  const k = canonicalKey.replace(/^\/+/, "");
  return `/${k}`;
}

async function resolveS3ObjectKey(relativeKey: string): Promise<string> {
  const canonical = fullS3Key(relativeKey);
  if (await s3ObjectExists(canonical)) return canonical;
  const legacy = legacyLeadingSlashS3Key(canonical);
  if (await s3ObjectExists(legacy)) return legacy;
  return canonical;
}

export async function s3PutObject(
  relativeKey: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: s3Bucket(),
      Key: fullS3Key(relativeKey),
      Body: body,
      ContentType: contentType || "application/octet-stream",
    }),
  );
}

export async function s3DeleteObject(relativeKey: string): Promise<void> {
  const key = await resolveS3ObjectKey(relativeKey);
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: s3Bucket(),
      Key: key,
    }),
  );
}

export async function s3ObjectExists(relativeKey: string): Promise<boolean> {
  try {
    await getClient().send(
      new HeadObjectCommand({
        Bucket: s3Bucket(),
        Key: fullS3Key(relativeKey),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function s3PresignedGetUrl(relativeKey: string, expiresSec = 3600): Promise<string> {
  const key = await resolveS3ObjectKey(relativeKey);
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: s3Bucket(),
      Key: key,
    }),
    { expiresIn: expiresSec },
  );
}

export async function s3GetObjectStream(relativeKey: string) {
  const key = await resolveS3ObjectKey(relativeKey);
  const out = await getClient().send(
    new GetObjectCommand({
      Bucket: s3Bucket(),
      Key: key,
    }),
  );
  return out;
}

export async function s3GetObjectBuffer(relativeKey: string): Promise<Buffer> {
  const out = await s3GetObjectStream(relativeKey);
  const body = out.Body;
  if (!body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
