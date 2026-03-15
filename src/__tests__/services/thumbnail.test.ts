import { describe, expect, it, vi } from 'vitest';
import { generateImageThumbnail } from '@/services/thumbnail';

describe('generateImageThumbnail', () => {
  it('throws when image dimensions are invalid', async () => {
    const image = { naturalWidth: 0, naturalHeight: 0 } as HTMLImageElement;
    await expect(generateImageThumbnail(image)).rejects.toThrow('Invalid image size');
  });

  it('creates webp thumbnail with 200px width', async () => {
    const blob = new Blob(['x'], { type: 'image/webp' });
    const drawImage = vi.fn();
    const toBlob = vi.fn((cb: BlobCallback) => cb(blob));
    const canvasStub = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob,
    };

    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return canvasStub as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName);
    });

    const image = { naturalWidth: 400, naturalHeight: 200 } as HTMLImageElement;
    const result = await generateImageThumbnail(image);

    expect(result.type).toBe('image/webp');
    expect(canvasStub.width).toBe(200);
    expect(canvasStub.height).toBe(100);
    expect(drawImage).toHaveBeenCalledWith(image, 0, 0, 200, 100);
    expect(toBlob).toHaveBeenCalled();
    createElementSpy.mockRestore();
  });
});
