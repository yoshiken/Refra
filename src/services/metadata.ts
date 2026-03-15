import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME } from '@/lib/s3Client';
import type { AssetMeta, AssetIndexEntry, IndexFile } from '@/types';

const DEFAULT_INDEX: IndexFile = {
  version: 1,
  updatedAt: '',
  assets: [],
  folders: [],
};
const MAX_RETRIES = 3;

function normalizeEtag(etag?: string): string {
  return etag?.replaceAll('"', '') ?? '';
}

export async function getIndex(): Promise<{ data: IndexFile; etag: string }> {
  const res = await s3Client.send(
    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: 'meta/index.json' })
  );
  const body = await res.Body?.transformToString();

  return {
    data: body ? (JSON.parse(body) as IndexFile) : DEFAULT_INDEX,
    etag: normalizeEtag(res.ETag),
  };
}

export async function getAssetMeta(id: string): Promise<{ data: AssetMeta; etag: string }> {
  const res = await s3Client.send(
    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: `meta/${id}.json` })
  );
  const body = await res.Body?.transformToString();
  if (!body) {
    throw new Error(`Asset metadata is empty: ${id}`);
  }

  return {
    data: JSON.parse(body) as AssetMeta,
    etag: normalizeEtag(res.ETag),
  };
}

export async function putAssetMeta(meta: AssetMeta, etag?: string): Promise<void> {
  if (etag) {
    const head = await s3Client.send(
      new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: `meta/${meta.id}.json` })
    );
    const currentEtag = normalizeEtag(head.ETag);
    if (currentEtag && normalizeEtag(etag) !== currentEtag) {
      throw new Error(`Asset metadata conflict: ${meta.id}`);
    }
  }

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `meta/${meta.id}.json`,
      Body: JSON.stringify(meta),
      ContentType: 'application/json',
    })
  );
}

export async function updateIndex(entry: AssetIndexEntry, etag?: string): Promise<void> {
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt += 1;
    const { data: index, etag: currentEtag } = await getIndex();
    if (etag && currentEtag && normalizeEtag(etag) !== currentEtag) {
      throw new Error('Index conflict: ETag mismatch. Refetch and retry.');
    }

    const targetIndex = index.assets.findIndex((asset) => asset.id === entry.id);
    if (targetIndex >= 0) {
      index.assets[targetIndex] = entry;
    } else {
      index.assets.push(entry);
    }
    index.updatedAt = new Date().toISOString();

    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: 'meta/index.json',
          Body: JSON.stringify(index),
          ContentType: 'application/json',
        })
      );
      return;
    } catch (error) {
      if (attempt >= MAX_RETRIES) {
        throw error;
      }
    }
  }

  throw new Error('Failed to update index after retries');
}

export async function saveIndex(index: IndexFile, etag?: string): Promise<void> {
  const { etag: currentEtag } = await getIndex();
  if (etag && currentEtag && normalizeEtag(etag) !== currentEtag) {
    throw new Error('Index conflict: ETag mismatch. Refetch and retry.');
  }

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: 'meta/index.json',
      Body: JSON.stringify(index),
      ContentType: 'application/json',
    })
  );
}

export async function removeFromIndex(assetId: string, etag?: string): Promise<void> {
  const { data: index, etag: currentEtag } = await getIndex();
  if (etag && currentEtag && normalizeEtag(etag) !== currentEtag) {
    throw new Error('Index conflict: ETag mismatch. Refetch and retry.');
  }

  index.assets = index.assets.filter((asset) => asset.id !== assetId);
  index.updatedAt = new Date().toISOString();

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: 'meta/index.json',
      Body: JSON.stringify(index),
      ContentType: 'application/json',
    })
  );
}
