import { useEffect, useMemo, useState } from 'react';
import { uploadFile } from '@/services/storage';
import { generateImageThumbnail, generateVideoThumbnail } from '@/services/thumbnail';
import { getIndex, putAssetMeta, updateIndex } from '@/services/metadata';
import type { AssetMeta, AssetIndexEntry, FolderMeta } from '@/types';

const SUPPORTED_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const SUPPORTED_VIDEO = ['video/mp4', 'video/webm', 'video/quicktime'];

function splitTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function fileExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : 'bin';
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像の読み込みに失敗しました'));
    };
    image.src = url;
  });
}

function loadVideo(file: File): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('動画の読み込みに失敗しました'));
    };
    video.src = url;
  });
}

function getImageMeta(image: HTMLImageElement): { resolution: { width: number; height: number } } {
  return {
    resolution: {
      width: image.naturalWidth,
      height: image.naturalHeight,
    },
  };
}

function getVideoMeta(video: HTMLVideoElement): {
  duration: number;
  resolution: { width: number; height: number };
} {
  return {
    duration: video.duration,
    resolution: { width: video.videoWidth, height: video.videoHeight },
  };
}

export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [folderId, setFolderId] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [folders, setFolders] = useState<FolderMeta[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await getIndex();
        setFolders(data.folders);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'フォルダ取得に失敗しました');
      }
    })();
  }, []);

  const fileType = useMemo(() => {
    if (!file) return null;
    if (SUPPORTED_IMAGE.includes(file.type)) return 'image' as const;
    if (SUPPORTED_VIDEO.includes(file.type)) return 'video' as const;
    return null;
  }, [file]);

  const onSelectFile = (selected: File | null) => {
    if (!selected) return;
    setFile(selected);
    if (!name.trim()) {
      setName(selected.name.replace(/\.[^.]+$/, ''));
    }
    setStatus(null);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file || !fileType) {
      setError('対応していないファイル形式です');
      return;
    }

    const assetId = crypto.randomUUID();
    const now = new Date().toISOString();
    const ext = fileExtension(file.name);
    const assetKey = `assets/${assetId}.${ext}`;
    const thumbnailKey = `thumbnails/${assetId}.webp`;
    const displayName = name.trim() || file.name;

    setIsUploading(true);
    setError(null);
    setStatus('サムネイル生成中...');

    try {
      let duration: number | null = null;
      let resolution: { width: number; height: number } | null = null;
      let thumbnailBlob: Blob;

      if (fileType === 'image') {
        const image = await loadImage(file);
        thumbnailBlob = await generateImageThumbnail(image);
        resolution = getImageMeta(image).resolution;
      } else {
        const video = await loadVideo(file);
        thumbnailBlob = await generateVideoThumbnail(video);
        const videoMeta = getVideoMeta(video);
        duration = videoMeta.duration;
        resolution = videoMeta.resolution;
      }

      setStatus('S3へアップロード中...');
      await uploadFile(assetKey, file);
      await uploadFile(thumbnailKey, thumbnailBlob);

      const metadata: AssetMeta = {
        id: assetId,
        name: displayName,
        type: fileType,
        originalPath: `/${assetKey}`,
        thumbnailPath: `/${thumbnailKey}`,
        folderId: folderId || null,
        tags: splitTags(tags),
        sourceUrl: sourceUrl.trim() || null,
        sourceUrlMeta: sourceUrl.trim()
          ? {
              title: sourceUrl.trim(),
              channel: '手動入力',
              url: sourceUrl.trim(),
            }
          : null,
        resolution,
        duration,
        scenes: [],
        comments: [],
        createdBy: 'local-user',
        createdAt: now,
        updatedAt: now,
      };

      const indexEntry: AssetIndexEntry = {
        id: assetId,
        name: displayName,
        type: fileType,
        thumbnailPath: `/${thumbnailKey}`,
        folderId: folderId || null,
        tags: splitTags(tags),
        createdBy: 'local-user',
        createdAt: now,
        updatedAt: now,
      };

      setStatus('メタデータ更新中...');
      await putAssetMeta(metadata);
      await updateIndex(indexEntry);

      setStatus('アップロード完了');
      setFile(null);
      setFolderId('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'アップロードに失敗しました');
      setStatus(null);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="p-8">
      <main className="mx-auto max-w-2xl space-y-4 rounded border border-border-primary bg-bg-secondary p-6">
        <h1 className="text-2xl font-bold">アップロード</h1>
        <p className="text-sm text-text-secondary">画像/動画ファイルをアップロードしてメタデータを登録します。</p>

        <label className="block rounded border border-dashed border-border-primary p-6 text-center">
          <input
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
            onChange={(e) => onSelectFile(e.target.files?.[0] ?? null)}
          />
          <span className="text-sm">ここをクリックしてファイル選択（ドラッグ&ドロップ対応）</span>
        </label>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onSelectFile(e.dataTransfer.files?.[0] ?? null);
          }}
          className="rounded border border-border-primary p-4 text-center text-xs text-text-secondary"
        >
          ここにファイルをドロップ
        </div>

        {file && (
          <div className="rounded border border-border-primary p-3 text-sm">
            <p>選択ファイル: {file.name}</p>
            <p>種別: {fileType ?? '非対応'}</p>
            <p>サイズ: {(file.size / (1024 * 1024)).toFixed(2)} MB</p>
          </div>
        )}

        <label className="block text-sm">
          表示名
          <input
            className="mt-1 w-full rounded border border-border-primary bg-bg-primary px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          タグ（カンマ区切り）
          <input
            className="mt-1 w-full rounded border border-border-primary bg-bg-primary px-3 py-2"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          フォルダ
          <select
            className="mt-1 w-full rounded border border-border-primary bg-bg-primary px-3 py-2"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
          >
            <option value="">未選択</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          引用元URL（任意）
          <input
            className="mt-1 w-full rounded border border-border-primary bg-bg-primary px-3 py-2"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
          />
        </label>

        {error && <p className="rounded border border-red-500/50 bg-red-500/10 p-3 text-sm">{error}</p>}
        {status && <p className="rounded border border-border-primary bg-bg-tertiary p-3 text-sm">{status}</p>}

        <button
          type="button"
          onClick={() => void handleUpload()}
          disabled={isUploading || !file}
          className="rounded bg-bg-tertiary px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {isUploading ? 'アップロード中...' : 'アップロード開始'}
        </button>
      </main>
    </div>
  );
}
