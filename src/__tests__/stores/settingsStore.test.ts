import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const putMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    settings: {
      get: getMock,
      put: putMock,
    },
  },
}));

describe('settingsStore', () => {
  beforeEach(() => {
    getMock.mockReset();
    putMock.mockReset();
  });

  it('returns default settings when no record exists', async () => {
    getMock.mockResolvedValue(undefined);
    const { getSettings } = await import('@/stores/settingsStore');

    await expect(getSettings()).resolves.toEqual({
      theme: 'dark',
      thumbnailSize: 200,
      locale: 'ja',
    });
  });

  it('merges and persists updated settings', async () => {
    getMock.mockResolvedValue({
      id: 'default',
      value: { theme: 'dark', thumbnailSize: 200, locale: 'ja' },
    });
    const { updateSettings } = await import('@/stores/settingsStore');

    await expect(updateSettings({ thumbnailSize: 240 })).resolves.toEqual({
      theme: 'dark',
      thumbnailSize: 240,
      locale: 'ja',
    });
    expect(putMock).toHaveBeenCalledWith({
      id: 'default',
      value: { theme: 'dark', thumbnailSize: 240, locale: 'ja' },
    });
  });
});
