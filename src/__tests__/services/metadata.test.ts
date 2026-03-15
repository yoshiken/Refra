import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { AssetIndexEntry } from '@/types';

const sendMock = vi.fn();

vi.mock('@/lib/s3Client', () => ({
  BUCKET_NAME: 'test-bucket',
  s3Client: {
    send: sendMock,
  },
}));

function responseWithJson(data: unknown, etag = '"etag-1"') {
  return {
    ETag: etag,
    Body: {
      transformToString: async () => JSON.stringify(data),
    },
  };
}

describe('metadata service', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('retries updateIndex when put fails once', async () => {
    const entry: AssetIndexEntry = {
      id: 'a1',
      name: 'asset',
      type: 'image',
      thumbnailPath: '/thumbnails/a1.webp',
      folderId: null,
      tags: [],
      createdBy: 'u',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    sendMock
      .mockResolvedValueOnce(responseWithJson({ version: 1, updatedAt: '', assets: [], folders: [] }))
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(responseWithJson({ version: 1, updatedAt: '', assets: [], folders: [] }))
      .mockResolvedValueOnce({ ETag: '"etag-2"' });

    const { updateIndex } = await import('@/services/metadata');
    await expect(updateIndex(entry)).resolves.toBeUndefined();

    expect(sendMock.mock.calls.filter((call) => call[0] instanceof GetObjectCommand)).toHaveLength(2);
    expect(sendMock.mock.calls.filter((call) => call[0] instanceof PutObjectCommand)).toHaveLength(2);
  });

  it('retries removeFromIndex when put fails once', async () => {
    sendMock
      .mockResolvedValueOnce(
        responseWithJson({
          version: 1,
          updatedAt: '',
          assets: [
            {
              id: 'a1',
              name: 'asset',
              type: 'image',
              thumbnailPath: '/thumbnails/a1.webp',
              folderId: null,
              tags: [],
              createdBy: 'u',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          folders: [],
        })
      )
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(responseWithJson({ version: 1, updatedAt: '', assets: [], folders: [] }))
      .mockResolvedValueOnce({ ETag: '"etag-2"' });

    const { removeFromIndex } = await import('@/services/metadata');
    await expect(removeFromIndex('a1')).resolves.toBeUndefined();
  });

  it('throws on putAssetMeta ETag mismatch', async () => {
    sendMock.mockResolvedValueOnce({ ETag: '"new-etag"' });
    const { putAssetMeta } = await import('@/services/metadata');
    await expect(
      putAssetMeta(
        {
          id: 'a1',
          name: 'asset',
          type: 'image',
          originalPath: '/assets/a1.jpg',
          thumbnailPath: '/thumbnails/a1.webp',
          folderId: null,
          tags: [],
          sourceUrl: null,
          sourceUrlMeta: null,
          resolution: null,
          duration: null,
          scenes: [],
          comments: [],
          createdBy: 'u',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        'old-etag'
      )
    ).rejects.toThrow('Asset metadata conflict');
    expect(sendMock.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
  });
});
