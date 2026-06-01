import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME,
  );
}

export function r2Client(): S3Client | null {
  if (!isR2Configured()) return null;
  const accountId = process.env.R2_ACCOUNT_ID!;
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export async function putCaptureObject(
  key: string,
  body: Buffer,
  contentType = "image/png",
): Promise<void> {
  const client = r2Client();
  if (!client) throw new Error("R2 is not configured");
  const bucket = process.env.R2_BUCKET_NAME!;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getCaptureObject(key: string): Promise<Uint8Array> {
  const client = r2Client();
  if (!client) throw new Error("R2 is not configured");
  const bucket = process.env.R2_BUCKET_NAME!;
  const out = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
  if (!out.Body) throw new Error("Empty R2 object body");
  return out.Body.transformToByteArray();
}
