// S3ファイル操作
// spec.md §2.1 バケット構成に準拠
import { s3Client, BUCKET_NAME } from '@/lib/s3Client';
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

export async function uploadFile(key: string, file: Blob) {
  return s3Client.send(
    new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key, Body: file })
  );
}

export async function downloadFile(key: string) {
  return s3Client.send(
    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key })
  );
}

export async function deleteFile(key: string) {
  return s3Client.send(
    new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key })
  );
}

export async function listFiles(prefix = '') {
  return s3Client.send(
    new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: prefix })
  );
}
