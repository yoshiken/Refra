import { useMemo, useRef, useState } from 'react';
import { getS3Url } from '@/lib/s3Client';
import { uploadFile, deleteFile } from '@/services/storage';
import type { AssetMeta, FolderMeta, SceneMeta } from '@/types';

interface SceneEditorProps {
  asset: AssetMeta;
  onUpdate: (nextAsset: AssetMeta) => Promise<void>;
  onPlayScene: (scene: SceneMeta) => void;
  folders: FolderMeta[];
}

async function captureFrameAt(videoSrc: string, timeSeconds: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'metadata';

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };

    const onError = () => {
      cleanup();
      reject(new Error('サムネイル用の動画読み込みに失敗しました'));
    };

    const onSeeked = () => {
      cleanup();
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        reject(new Error('Invalid video size'));
        return;
      }
      const targetWidth = 200;
      const targetHeight = Math.round((video.videoHeight / video.videoWidth) * targetWidth);
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('フレームキャプチャに失敗しました')); return; }
        resolve(blob);
      }, 'image/webp', 0.8);
    };

    const onLoadedMetadata = () => {
      video.currentTime = timeSeconds;
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.src = videoSrc;
    video.load();
  });
}

export default function SceneEditor({ asset, onUpdate, onPlayScene, folders }: SceneEditorProps) {
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(5);
  const [sceneName, setSceneName] = useState('');
  const [sceneTags, setSceneTags] = useState('');
  const [sceneFolderId, setSceneFolderId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const activeSceneIdRef = useRef<string | null>(null);

  const sortedScenes = useMemo(
    () => [...asset.scenes].sort((a, b) => a.startTime - b.startTime),
    [asset.scenes]
  );

  const addScene = async () => {
    if (asset.type !== 'video') return;
    if (startTime >= endTime) {
      setError('終了時間は開始時間より大きくしてください');
      return;
    }

    setError(null);
    setIsAdding(true);
    try {
      const sceneId = crypto.randomUUID();
      const thumbKey = `thumbnails/scenes/${sceneId}.webp`;

      const thumbBlob = await captureFrameAt(getS3Url(asset.originalPath), startTime);
      await uploadFile(thumbKey, thumbBlob);

      const newScene: SceneMeta = {
        id: sceneId,
        assetId: asset.id,
        name: sceneName.trim() || `Scene ${asset.scenes.length + 1}`,
        tags: sceneTags.split(',').map((tag) => tag.trim()).filter(Boolean),
        folderId: sceneFolderId || null,
        startTime,
        endTime,
        thumbnailPath: `/${thumbKey}`,
        createdBy: 'local-user',
        createdAt: new Date().toISOString(),
      };

      await onUpdate({
        ...asset,
        scenes: [...asset.scenes, newScene],
        updatedAt: new Date().toISOString(),
      });
      setSceneName('');
      setSceneTags('');
      setSceneFolderId('');
    } catch (e) {
      console.error('[SceneEditor] addScene failed:', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsAdding(false);
    }
  };

  const removeScene = async (scene: SceneMeta) => {
    await deleteFile(scene.thumbnailPath.replace(/^\//, ''));
    if (activeSceneIdRef.current === scene.id) {
      activeSceneIdRef.current = null;
    }
    await onUpdate({
      ...asset,
      scenes: asset.scenes.filter((item) => item.id !== scene.id),
      updatedAt: new Date().toISOString(),
    });
  };

  const handlePlayScene = (scene: SceneMeta) => {
    activeSceneIdRef.current = scene.id;
    onPlayScene(scene);
  };

  if (asset.type !== 'video') return null;

  return (
    <section className="mt-4 rounded border border-border-primary bg-bg-secondary p-4">
      <h2 className="mb-3 text-lg font-semibold">シーン一覧</h2>

      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          type="number"
          min={0}
          step={0.1}
          value={startTime}
          onChange={(e) => setStartTime(Number(e.target.value))}
          className="rounded border border-border-primary bg-bg-primary px-2 py-1 text-sm"
          placeholder="開始秒"
        />
        <input
          type="number"
          min={0}
          step={0.1}
          value={endTime}
          onChange={(e) => setEndTime(Number(e.target.value))}
          className="rounded border border-border-primary bg-bg-primary px-2 py-1 text-sm"
          placeholder="終了秒"
        />
        <button
          type="button"
          disabled={isAdding}
          onClick={() => void addScene()}
          className="rounded bg-bg-tertiary px-3 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {isAdding ? '追加中...' : 'シーン追加'}
        </button>
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <input
          type="text"
          value={sceneName}
          onChange={(e) => setSceneName(e.target.value)}
          className="rounded border border-border-primary bg-bg-primary px-2 py-1 text-sm"
          placeholder="シーン名（省略可）"
        />
        <input
          type="text"
          value={sceneTags}
          onChange={(e) => setSceneTags(e.target.value)}
          className="rounded border border-border-primary bg-bg-primary px-2 py-1 text-sm"
          placeholder="タグ（カンマ区切り）"
        />
        <select
          value={sceneFolderId}
          onChange={(e) => setSceneFolderId(e.target.value)}
          className="rounded border border-border-primary bg-bg-primary px-2 py-1 text-sm"
        >
          <option value="">フォルダ未選択</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mb-3 rounded border border-red-500/50 bg-red-500/10 p-2 text-xs">{error}</p>}

      <div className="space-y-2">
        {sortedScenes.map((scene) => (
          <article key={scene.id} className="grid items-center gap-2 rounded border border-border-primary p-2 sm:grid-cols-[88px_1fr_auto_auto]">
            <img src={getS3Url(scene.thumbnailPath)} alt="scene thumbnail" className="h-14 w-20 rounded object-cover" />
            <div className="text-xs">
              <p className="font-medium">{scene.name}</p>
              <p>
                {scene.startTime.toFixed(1)}s - {scene.endTime.toFixed(1)}s
              </p>
              {scene.tags.length > 0 && (
                <p className="text-text-secondary">{scene.tags.join(', ')}</p>
              )}
            </div>
            <button
              type="button"
              className="rounded border border-border-primary px-2 py-1 text-xs"
              onClick={() => handlePlayScene(scene)}
            >
              再生
            </button>
            <button
              type="button"
              className="rounded border border-red-500 px-2 py-1 text-xs text-red-500"
              onClick={() => void removeScene(scene)}
            >
              削除
            </button>
          </article>
        ))}
        {sortedScenes.length === 0 && <p className="text-sm text-text-secondary">シーンはまだありません。</p>}
      </div>
    </section>
  );
}
