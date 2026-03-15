import { useEffect, useRef, useState } from 'react';
import { clearCompareAssets, getCompareAssets } from '@/stores/compareStore';
import { getAssetMeta } from '@/services/metadata';
import { getS3Url } from '@/lib/s3Client';
import type { AssetMeta } from '@/types';

function gridClass(count: number): string {
  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-1 lg:grid-cols-2';
  if (count === 3) return 'grid-cols-1 lg:grid-cols-2';
  return 'grid-cols-1 md:grid-cols-2';
}

function AssetPanel({
  asset,
  index,
  syncMode,
  registerVideo,
  onPrimaryPlay,
  onPrimaryPause,
  onPrimarySeeked,
}: {
  asset: AssetMeta;
  index: number;
  syncMode: boolean;
  registerVideo: (index: number, el: HTMLVideoElement | null) => void;
  onPrimaryPlay: () => void;
  onPrimaryPause: () => void;
  onPrimarySeeked: () => void;
}) {
  const [openComments, setOpenComments] = useState(false);

  return (
    <section className="rounded border border-border-primary bg-bg-secondary p-3">
      <p className="mb-2 text-sm font-semibold">{asset.name}</p>
      {asset.type === 'image' ? (
        <img src={getS3Url(asset.originalPath)} alt={asset.name} className="max-h-[55vh] w-full rounded object-contain" />
      ) : (
        <video
          ref={(el) => registerVideo(index, el)}
          src={getS3Url(asset.originalPath)}
          controls
          className="w-full rounded"
          onPlay={index === 0 ? onPrimaryPlay : undefined}
          onPause={index === 0 ? onPrimaryPause : undefined}
          onSeeked={index === 0 ? onPrimarySeeked : undefined}
        />
      )}
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-text-secondary">
          コメント: {asset.comments.length}件 / モード: {syncMode ? '同期' : '個別'}
        </p>
        <button type="button" className="text-xs underline" onClick={() => setOpenComments((prev) => !prev)}>
          {openComments ? '閉じる' : '表示'}
        </button>
      </div>
      {openComments && (
        <div className="mt-2 max-h-32 space-y-1 overflow-auto rounded border border-border-primary bg-bg-primary p-2 text-xs">
          {asset.comments.map((comment) => (
            <p key={comment.id}>
              {comment.timestamp !== null ? `[${comment.timestamp.toFixed(1)}s] ` : ''}
              {comment.author}: {comment.text}
            </p>
          ))}
          {asset.comments.length === 0 && <p className="text-text-secondary">コメントなし</p>}
        </div>
      )}
    </section>
  );
}

export default function Compare() {
  const [assets, setAssets] = useState<AssetMeta[]>([]);
  const [syncMode, setSyncMode] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const ids = await getCompareAssets();
        const loaded = await Promise.all(ids.map(async (id) => (await getAssetMeta(id)).data));
        setAssets(loaded);
      } catch (e) {
        setError(e instanceof Error ? e.message : '比較データの取得に失敗しました');
      }
    })();
  }, []);

  const handlePrimaryPlay = () => {
    if (!syncMode) return;
    videoRefs.current.forEach((video, index) => {
      if (index !== 0) void video?.play();
    });
  };

  const handlePrimaryPause = () => {
    if (!syncMode) return;
    videoRefs.current.forEach((video, index) => {
      if (index !== 0) video?.pause();
    });
  };

  const handlePrimarySeeked = () => {
    if (!syncMode) return;
    const time = videoRefs.current[0]?.currentTime ?? 0;
    videoRefs.current.forEach((video, index) => {
      if (index !== 0 && video) {
        video.currentTime = time;
      }
    });
  };

  return (
    <div className="p-6">
      <header className="mb-4 flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm">
            <input
              type="checkbox"
              className="mr-2"
              checked={syncMode}
              onChange={(e) => setSyncMode(e.target.checked)}
            />
            動画同期再生
          </label>
          <button
            type="button"
            onClick={() => void clearCompareAssets()}
            className="rounded border border-border-primary px-3 py-1 text-xs"
          >
            選択クリア
          </button>
        </div>
      </header>

      {error && <p className="mb-4 rounded border border-red-500/50 bg-red-500/10 p-3 text-sm">{error}</p>}
      {assets.length === 0 && <p className="text-sm text-text-secondary">比較対象がありません。一覧で選択してください。</p>}

      {assets.length === 3 ? (
        <main className="grid grid-cols-2 grid-rows-2 gap-3">
          <div className="row-span-2">
            <AssetPanel
              asset={assets[0]}
              index={0}
              syncMode={syncMode}
              registerVideo={(index, el) => {
                videoRefs.current[index] = el;
              }}
              onPrimaryPlay={handlePrimaryPlay}
              onPrimaryPause={handlePrimaryPause}
              onPrimarySeeked={handlePrimarySeeked}
            />
          </div>
          <AssetPanel
            asset={assets[1]}
            index={1}
            syncMode={syncMode}
            registerVideo={(index, el) => {
              videoRefs.current[index] = el;
            }}
            onPrimaryPlay={handlePrimaryPlay}
            onPrimaryPause={handlePrimaryPause}
            onPrimarySeeked={handlePrimarySeeked}
          />
          <AssetPanel
            asset={assets[2]}
            index={2}
            syncMode={syncMode}
            registerVideo={(index, el) => {
              videoRefs.current[index] = el;
            }}
            onPrimaryPlay={handlePrimaryPlay}
            onPrimaryPause={handlePrimaryPause}
            onPrimarySeeked={handlePrimarySeeked}
          />
        </main>
      ) : (
        <main className={`grid gap-3 ${gridClass(assets.length)}`}>
          {assets.map((asset, index) => (
            <AssetPanel
              key={asset.id}
              asset={asset}
              index={index}
              syncMode={syncMode}
              registerVideo={(i, el) => {
                videoRefs.current[i] = el;
              }}
              onPrimaryPlay={handlePrimaryPlay}
              onPrimaryPause={handlePrimaryPause}
              onPrimarySeeked={handlePrimarySeeked}
            />
          ))}
        </main>
      )}
    </div>
  );
}
