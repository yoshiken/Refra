import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME } from '@/lib/s3Client';
import type { AssetMeta, AssetIndexEntry, IndexFile, SceneIndexEntry, SceneMeta } from '@/types';

const DEFAULT_INDEX: IndexFile = {
  version: 2,
  updatedAt: '',
  assets: [],
  scenes: [],
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
  const data = body ? (JSON.parse(body) as IndexFile) : { ...DEFAULT_INDEX };

  if (!data.scenes) {
    data.scenes = [];
    data.version = 2;
  }

  return {
    data,
    etag: normalizeEtag(res.ETag),
  };
}

function normalizeScene(scene: SceneMeta, assetId: string, index: number): SceneMeta {
  const fallbackName = `Scene ${index + 1}`;
  return {
    ...scene,
    assetId: scene.assetId ?? assetId,
    name: scene.name || fallbackName,
    tags: Array.isArray(scene.tags) ? scene.tags : [],
    folderId: scene.folderId ?? null,
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

  const data = JSON.parse(body) as AssetMeta;

  return {
    data: {
      ...data,
      scenes: (data.scenes ?? []).map((scene, index) => normalizeScene(scene, id, index)),
    },
    etag: normalizeEtag(res.ETag),
  };
}

export async function putAssetMeta(meta: AssetMeta, etag?: string): Promise<void> {
  if (etag) {
    // PutObject に If-Match が使えないため、現状は事前に ETag を確認する運用。
    // この方式は HeadObject → PutObject 間の TOCTOU を完全には防げない。
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

export async function updateIndex(entry: AssetIndexEntry): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const { data: index } = await getIndex();

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
      if (attempt === MAX_RETRIES - 1) {
        throw error;
      }
    }
  }

  throw new Error('Failed to update index after retries');
}

export async function syncScenesForAsset(
  assetId: string,
  assetName: string,
  assetType: 'image' | 'video',
  scenes: SceneMeta[]
): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const { data: index } = await getIndex();
    index.scenes = index.scenes.filter((scene) => scene.assetId !== assetId);

    const nextScenes: SceneIndexEntry[] = scenes.map((scene) => ({
      id: scene.id,
      assetId,
      assetName,
      name: scene.name,
      tags: scene.tags,
      thumbnailPath: scene.thumbnailPath,
      startTime: scene.startTime,
      endTime: scene.endTime,
      folderId: scene.folderId,
      assetType,
      createdBy: scene.createdBy,
      createdAt: scene.createdAt,
    }));
    index.scenes.push(...nextScenes);
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
      if (attempt === MAX_RETRIES - 1) {
        throw error;
      }
    }
  }

  throw new Error('Failed to sync scenes after retries');
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

export async function removeFromIndex(assetId: string): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const { data: index } = await getIndex();

    index.assets = index.assets.filter((asset) => asset.id !== assetId);
    index.scenes = index.scenes.filter((scene) => scene.assetId !== assetId);
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
      if (attempt === MAX_RETRIES - 1) {
        throw error;
      }
    }
  }

  throw new Error('Failed to remove index after retries');
}
