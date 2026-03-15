import { S3Client } from '@aws-sdk/client-s3';

const isLocal = import.meta.env.VITE_AUTH_DISABLED === 'true';
const endpoint = import.meta.env.VITE_S3_ENDPOINT || 'http://localhost:4566';
const region = import.meta.env.VITE_AWS_REGION || 'ap-northeast-1';

export const s3Client = new S3Client(
  isLocal
    ? {
        region,
        endpoint,
        forcePathStyle: true,
        credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      }
    : {
        region,
        // 本番ではCognito Identity Poolから取得したクレデンシャルを使用
      }
);

export const BUCKET_NAME = import.meta.env.VITE_S3_BUCKET || 'refra-dev';
