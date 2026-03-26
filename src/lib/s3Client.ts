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
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      }
    : {
        region,
        // 本番ではCognito Identity Poolから取得したクレデンシャルを使用
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      }
);

export const BUCKET_NAME = import.meta.env.VITE_S3_BUCKET || 'refra-dev';

/** S3パス（"/thumbnails/xxx.webp"）を表示用URLに変換 */
export function getS3Url(path: string | null | undefined): string {
  if (!path) return '';
  const key = path.replace(/^\//, '');
  if (isLocal) {
    return `${endpoint}/${BUCKET_NAME}/${key}`;
  }
  // 本番: CloudFrontのURLなど（環境変数で設定予定）
  return `/${key}`;
}
