// S3ファイル操作
// spec.md §2.1 バケット構成に準拠
import { s3Client, BUCKET_NAME } from '@/lib/s3Client';
import { Upload } from '@aws-sdk/lib-storage';
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

const MULTIPART_THRESHOLD = 50 * 1024 * 1024;

export async function uploadFile(
  key: string,
  file: Blob | File,
  onProgress?: (percent: number) => void
): Promise<void> {
  if (file.size > MULTIPART_THRESHOLD) {
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: BUCKET_NAME,
        Key: key,
        Body: file,
        ContentType: file.type || undefined,
      },
      partSize: 10 * 1024 * 1024,
      leavePartsOnError: false,
    });

    if (onProgress) {
      upload.on('httpUploadProgress', (progress) => {
        if (!progress.loaded || !progress.total) return;
        onProgress(Math.round((progress.loaded / progress.total) * 100));
      });
    }

    await upload.done();
    return;
  }

  const buffer = await file.arrayBuffer();
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: new Uint8Array(buffer),
      ContentType: file.type || undefined,
    })
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
