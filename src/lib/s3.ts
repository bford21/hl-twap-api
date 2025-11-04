import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

if (!process.env.AWS_REGION) {
  throw new Error('Missing env.AWS_REGION');
}

if (!process.env.AWS_ACCESS_KEY_ID) {
  throw new Error('Missing env.AWS_ACCESS_KEY_ID');
}

if (!process.env.AWS_SECRET_ACCESS_KEY) {
  throw new Error('Missing env.AWS_SECRET_ACCESS_KEY');
}

if (!process.env.S3_BUCKET_NAME) {
  throw new Error('Missing env.S3_BUCKET_NAME');
}

export const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;

export async function listS3Objects(prefix?: string) {
  const command = new ListObjectsV2Command({
    Bucket: S3_BUCKET_NAME,
    Prefix: prefix,
  });

  const response = await s3Client.send(command);
  return response.Contents || [];
}

export async function getS3Object(key: string) {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
  });

  const response = await s3Client.send(command);
  
  if (!response.Body) {
    throw new Error('No body in S3 response');
  }

  const bodyString = await response.Body.transformToString();
  return bodyString;
}

