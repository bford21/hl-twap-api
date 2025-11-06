import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { config } from 'dotenv';
import * as lz4 from 'lz4';

// Load environment variables
config();

if (!process.env.AWS_ACCESS_KEY_ID) {
  throw new Error('Missing env.AWS_ACCESS_KEY_ID');
}

if (!process.env.AWS_SECRET_ACCESS_KEY) {
  throw new Error('Missing env.AWS_SECRET_ACCESS_KEY');
}

// Hyperliquid's public requester-pays bucket (these won't change)
export const S3_BUCKET_NAME = 'hl-mainnet-node-data';
export const S3_REGION = 'ap-northeast-1';

export const s3Client = new S3Client({
  region: S3_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export async function listS3Objects(prefix?: string) {
  const command = new ListObjectsV2Command({
    Bucket: S3_BUCKET_NAME,
    Prefix: prefix,
    RequestPayer: 'requester', // Required for requester-pays buckets
  });

  const response = await s3Client.send(command);
  return response.Contents || [];
}

export async function getS3Object(key: string) {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
    RequestPayer: 'requester', // Required for requester-pays buckets
  });

  const response = await s3Client.send(command);
  
  if (!response.Body) {
    throw new Error('No body in S3 response');
  }

  // Get the body as a buffer
  const compressedBuffer = await response.Body.transformToByteArray();
  
  // Check if the file is lz4 compressed based on the key
  if (key.endsWith('.lz4')) {
    // Decompress lz4 data
    const decompressed = lz4.decode(Buffer.from(compressedBuffer));
    return decompressed.toString('utf-8');
  }
  
  // If not compressed, return as string
  return Buffer.from(compressedBuffer).toString('utf-8');
}

