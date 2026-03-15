import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const putMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    compare: {
      get: getMock,
      put: putMock,
    },
  },
}));

describe('compareStore', () => {
  beforeEach(() => {
    getMock.mockReset();
    putMock.mockReset();
  });

  it('adds and removes asset IDs with max 4 limit', async () => {
    const { addCompareAsset } = await import('@/stores/compareStore');
    getMock.mockResolvedValue({ id: 'selection', assetIds: ['a', 'b', 'c', 'd'] });
    await expect(addCompareAsset('e')).resolves.toEqual(['a', 'b', 'c', 'd']);

    getMock.mockResolvedValue({ id: 'selection', assetIds: ['a', 'b'] });
    await expect(addCompareAsset('a')).resolves.toEqual(['b']);
  });

  it('clears compare assets', async () => {
    const { clearCompareAssets } = await import('@/stores/compareStore');
    await expect(clearCompareAssets()).resolves.toEqual([]);
    expect(putMock).toHaveBeenCalledWith({ id: 'selection', assetIds: [] });
  });
});
