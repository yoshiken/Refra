import { useMemo, useState } from 'react';
import { getS3Url } from '@/lib/s3Client';
import { cutScene } from '@/services/videoProcessor';
import { uploadFile, deleteFile } from '@/services/storage';
import { generateVideoThumbnail } from '@/services/thumbnail';
import type { AssetMeta, SceneMeta } from '@/types';

interface SceneEditorProps {
  asset: AssetMeta;
  onUpdate: (nextAsset: AssetMeta) => Promise<void>;
}

function createFileFromBlob(blob: Blob, name: string): File {
  return new File([blob], name, { type: blob.type || 'video/webm' });
}

async function loadVideoFromBlob(blob: Blob): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      resolve(video);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('シーン動画の読み込みに失敗しました'));
    };
    video.src = url;
  });
}

export default function SceneEditor({ asset, onUpdate }: SceneEditorProps) {
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(5);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCutting, setIsCutting] = useState(false);

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
    setIsCutting(true);
    setProgress(0);
    try {
      const response = await fetch(getS3Url(asset.originalPath));
      const sourceBlob = await response.blob();
      const sourceFile = createFileFromBlob(sourceBlob, `${asset.id}.mp4`);
      const clipBlob = await cutScene(sourceFile, startTime, endTime, (ratio) => {
        setProgress(Math.round(ratio * 100));
      });

      const sceneId = crypto.randomUUID();
      const clipKey = `scenes/${asset.id}/${sceneId}.webm`;
      const thumbKey = `thumbnails/scenes/${sceneId}.webp`;
      await uploadFile(clipKey, clipBlob);

      const video = await loadVideoFromBlob(clipBlob);
      const sceneThumb = await generateVideoThumbnail(video);
      await uploadFile(thumbKey, sceneThumb);

      const newScene: SceneMeta = {
        id: sceneId,
        startTime,
        endTime,
        clipPath: `/${clipKey}`,
        thumbnailPath: `/${thumbKey}`,
        createdBy: 'local-user',
        createdAt: new Date().toISOString(),
      };

      await onUpdate({
        ...asset,
        scenes: [...asset.scenes, newScene],
        updatedAt: new Date().toISOString(),
      });
      setProgress(100);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'シーン切り出しに失敗しました');
      setProgress(null);
    } finally {
      setIsCutting(false);
    }
  };

  const removeScene = async (scene: SceneMeta) => {
    await deleteFile(scene.clipPath.replace(/^\//, ''));
    await deleteFile(scene.thumbnailPath.replace(/^\//, ''));
    await onUpdate({
      ...asset,
      scenes: asset.scenes.filter((item) => item.id !== scene.id),
      updatedAt: new Date().toISOString(),
    });
  };

  if (asset.type !== 'video') return null;

  return (
    <section className="mt-4 rounded border border-border-primary bg-bg-secondary p-4">
      <h2 className="mb-3 text-lg font-semibold">シーン一覧</h2>
      <p className="mb-3 text-xs text-text-secondary">大きな動画では切り出しに時間がかかる場合があります。</p>

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
          disabled={isCutting}
          onClick={() => void addScene()}
          className="rounded bg-bg-tertiary px-3 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {isCutting ? '切り出し中...' : 'シーン追加'}
        </button>
      </div>

      {progress !== null && (
        <div className="mb-3 space-y-1">
          <div className="h-2 w-full rounded bg-bg-primary">
            <div className="h-2 rounded bg-blue-500" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-text-secondary">進捗: {progress}%</p>
        </div>
      )}
      {error && <p className="mb-3 rounded border border-red-500/50 bg-red-500/10 p-2 text-xs">{error}</p>}

      <div className="space-y-2">
        {sortedScenes.map((scene) => (
          <article key={scene.id} className="grid items-center gap-2 rounded border border-border-primary p-2 sm:grid-cols-[88px_1fr_auto]">
            <img src={getS3Url(scene.thumbnailPath)} alt="scene thumbnail" className="h-14 w-20 rounded object-cover" />
            <div className="text-xs">
              <p>
                {scene.startTime.toFixed(1)}s - {scene.endTime.toFixed(1)}s
              </p>
              <a href={getS3Url(scene.clipPath)} target="_blank" rel="noreferrer" className="underline text-text-secondary">
                再生
              </a>
            </div>
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
