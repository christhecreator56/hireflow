import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env.js';

const client = (endpoint?: string) =>
  new S3Client({
    endpoint,
    region: env.s3.region,
    forcePathStyle: true,
    credentials: { accessKeyId: env.s3.accessKey, secretAccessKey: env.s3.secretKey },
  });

const s3 = client(env.s3.endpoint);
// Signed URLs must use a host the browser can reach (differs from the in-Docker host).
const signer = client(env.s3.publicEndpoint);
const Bucket = env.s3.bucket;

export async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket }));
  }
}

export const putObject = (Key: string, Body: Buffer, ContentType: string) =>
  s3.send(new PutObjectCommand({ Bucket, Key, Body, ContentType }));

export const deleteObject = (Key: string) => s3.send(new DeleteObjectCommand({ Bucket, Key }));

/** Short-lived (5 min) download link; files never stream through the API. */
export const signedUrl = (Key: string, fileName: string) =>
  getSignedUrl(
    signer,
    new GetObjectCommand({
      Bucket,
      Key,
      ResponseContentDisposition: `inline; filename="${fileName.replace(/"/g, '')}"`,
    }),
    { expiresIn: 300 },
  );
