import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

const sendMock = vi.fn();

vi.mock('@/lib/s3Client', () => ({
  BUCKET_NAME: 'test-bucket',
  s3Client: {
    send: sendMock,
  },
}));

describe('storage service', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('uploads file with PutObjectCommand', async () => {
    const { uploadFile } = await import('@/services/storage');
    await uploadFile('assets/a.jpg', new Blob(['x']));
    expect(sendMock.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
  });

  it('downloads/deletes/lists with matching commands', async () => {
    const { downloadFile, deleteFile, listFiles } = await import('@/services/storage');
    await downloadFile('assets/a.jpg');
    await deleteFile('assets/a.jpg');
    await listFiles('assets/');
    expect(sendMock.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
    expect(sendMock.mock.calls[1][0]).toBeInstanceOf(DeleteObjectCommand);
    expect(sendMock.mock.calls[2][0]).toBeInstanceOf(ListObjectsV2Command);
  });
});
