import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BlobNotFoundError, del, head, issueSignedToken, presignUrl, put } from '@vercel/blob';
import { env } from './env.js';
import { HttpError } from './http.js';

/**
 * Resume storage. Vercel Blob (private store) when its read-write token is present (hosted on Vercel),
 * otherwise any S3-compatible bucket (SeaweedFS in local Docker). Same 5-minute signed links either way.
 */
const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
export const storageConfigured = () => useBlob() || !!env.s3.endpoint;

export function requireStorage() {
  if (!storageConfigured()) {
    throw new HttpError(503, 'File storage is not configured on this server, so resumes cannot be uploaded or opened yet.');
  }
}

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
const LINK_TTL_MS = 5 * 60_000;

export async function ensureBucket() {
  if (useBlob()) return; // Blob stores exist once created in the Vercel dashboard
  try {
    await s3.send(new HeadBucketCommand({ Bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket }));
  }
}

export async function putObject(Key: string, Body: Buffer, ContentType: string) {
  if (useBlob()) {
    await put(Key, Body, { access: 'private', contentType: ContentType, addRandomSuffix: false, allowOverwrite: true });
    return;
  }
  await s3.send(new PutObjectCommand({ Bucket, Key, Body, ContentType }));
}

export async function deleteObject(Key: string) {
  if (useBlob()) return del(Key);
  await s3.send(new DeleteObjectCommand({ Bucket, Key }));
}

export async function objectExists(Key: string) {
  try {
    if (useBlob()) await head(Key);
    else await s3.send(new HeadObjectCommand({ Bucket, Key }));
    return true;
  } catch (e) {
    if (e instanceof BlobNotFoundError || (e as { name?: string }).name === 'NotFound') return false;
    throw e;
  }
}

/** Short-lived (5 min) download link; files never stream through the API. */
export async function signedUrl(Key: string, fileName: string) {
  if (useBlob()) {
    const validUntil = Date.now() + LINK_TTL_MS;
    const token = await issueSignedToken({ pathname: Key, operations: ['get'], validUntil });
    const { presignedUrl } = await presignUrl(token, { operation: 'get', pathname: Key, access: 'private', validUntil });
    return presignedUrl;
  }
  return getSignedUrl(
    signer,
    new GetObjectCommand({
      Bucket,
      Key,
      ResponseContentDisposition: `inline; filename="${fileName.replace(/"/g, '')}"`,
    }),
    { expiresIn: LINK_TTL_MS / 1000 },
  );
}
