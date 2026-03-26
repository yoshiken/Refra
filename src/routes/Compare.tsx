import { useEffect, useRef, useState } from 'react'; // useRef for videoRefs
import { clearCompareAssets, getCompareAssets } from '@/stores/compareStore';
import { getAssetMeta, getIndex } from '@/services/metadata';
import { getS3Url } from '@/lib/s3Client';
import type { SceneMeta, AssetMeta } from '@/types';

interface ScenePanel {
  scene: SceneMeta;
  asset: AssetMeta;
}

function gridClass(count: number): string {
  if (count <= 1) return 'grid-cols-1 grid-rows-1';
  if (count === 2) return 'grid-cols-2 grid-rows-1';
  return 'grid-cols-2 grid-rows-2';
}

function Panel({
  panel,
  index,
  registerVideo,
  onPrimaryPlay,
  onPrimaryPause,
}: {
  panel: ScenePanel;
  index: number;
  registerVideo: (index: number, el: HTMLVideoElement | null) => void;
  onPrimaryPlay: () => void;
  onPrimaryPause: () => void;
}) {
  const { scene, asset } = panel;
  const startTime = scene.startTime;
  const endTime = scene.endTime;

  return (
    <section className="flex h-full flex-col overflow-hidden rounded border border-border-primary bg-bg-secondary p-3">
      <p className="mb-1 flex-shrink-0 truncate text-sm font-semibold">{scene.name}</p>
      <p className="mb-2 flex-shrink-0 truncate text-xs text-text-secondary">{asset.name}</p>
      {asset.type === 'image' ? (
        <img src={getS3Url(asset.originalPath)} alt={scene.name} className="min-h-0 flex-1 w-full rounded object-contain" />
      ) : (
        <video
          ref={(el) => registerVideo(index, el)}
          src={getS3Url(asset.originalPath)}
          autoPlay
          muted
          playsInline
          controls
          className="min-h-0 flex-1 w-full rounded object-contain bg-black"
          onLoadedMetadata={(e) => {
            e.currentTarget.currentTime = startTime;
          }}
          onTimeUpdate={(e) => {
            if (endTime > startTime && e.currentTarget.currentTime >= endTime) {
              e.currentTarget.currentTime = startTime;
            }
          }}
          onPlay={index === 0 ? onPrimaryPlay : undefined}
          onPause={index === 0 ? onPrimaryPause : undefined}
        />
      )}
      {scene.endTime > scene.startTime && (
        <p className="mt-1 flex-shrink-0 text-xs text-text-secondary">
          {scene.startTime.toFixed(1)}s - {scene.endTime.toFixed(1)}s
        </p>
      )}
    </section>
  );
}

export default function Compare() {
  const [panels, setPanels] = useState<ScenePanel[]>([]);
  const [syncMode, setSyncMode] = useState(true);
  const [allPlaying, setAllPlaying] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const sceneIds = await getCompareAssets();
        if (sceneIds.length === 0) return;

        const { data: index } = await getIndex();
        const sceneEntries = sceneIds
          .map((id) => index.scenes.find((s) => s.id === id))
          .filter(Boolean);

        const uniqueAssetIds = [...new Set(sceneEntries.map((s) => s!.assetId))];
        const assetMap = new Map<string, AssetMeta>();
        await Promise.all(
          uniqueAssetIds.map(async (assetId) => {
            const { data } = await getAssetMeta(assetId);
            assetMap.set(assetId, data);
          })
        );

        const loaded: ScenePanel[] = [];
        for (const entry of sceneEntries) {
          if (!entry) continue;
          const asset = assetMap.get(entry.assetId);
          if (!asset) continue;
          const scene = asset.scenes.find((s) => s.id === entry.id);
          if (!scene) continue;
          loaded.push({ scene, asset });
        }
        setPanels(loaded);
      } catch (e) {
        setError(e instanceof Error ? e.message : '比較データの取得に失敗しました');
      }
    })();
  }, []);

  const handlePrimaryPlay = () => {
    if (!syncMode) return;
    videoRefs.current.forEach((video, i) => { if (i !== 0) void video?.play(); });
  };

  const handlePrimaryPause = () => {
    if (!syncMode) return;
    videoRefs.current.forEach((video, i) => { if (i !== 0) video?.pause(); });
  };

  const registerVideo = (index: number, el: HTMLVideoElement | null) => {
    videoRefs.current[index] = el;
  };

  const handleSeekToStart = () => {
    panels.forEach((panel, i) => {
      const video = videoRefs.current[i];
      if (video) video.currentTime = panel.scene.startTime;
    });
  };

  return (
    <div className="flex h-[calc(100dvh-57px)] flex-col gap-3 overflow-hidden p-4">
      <header className="flex flex-shrink-0 flex-wrap items-center justify-end gap-3">
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
            onClick={() => {
              if (allPlaying) {
                videoRefs.current.forEach((v) => v?.pause());
              } else {
                videoRefs.current.forEach((v) => void v?.play());
              }
              setAllPlaying(!allPlaying);
            }}
            className="rounded border border-border-primary px-3 py-1 text-xs"
          >
            {allPlaying ? '⏹ 全停止' : '▶ 全再生'}
          </button>
          <button
            type="button"
            onClick={handleSeekToStart}
            className="rounded border border-border-primary px-3 py-1 text-xs"
          >
            ⏮ 先頭へ
          </button>
          <button
            type="button"
            onClick={() => void clearCompareAssets()}
            className="rounded border border-border-primary px-3 py-1 text-xs"
          >
            選択クリア
          </button>
        </div>
      </header>

      {error && <p className="flex-shrink-0 rounded border border-red-500/50 bg-red-500/10 p-3 text-sm">{error}</p>}
      {panels.length === 0 && <p className="text-sm text-text-secondary">比較対象がありません。一覧でシーンをドロップしてください。</p>}

      {panels.length === 3 ? (
        <main className="grid flex-1 grid-cols-2 grid-rows-2 gap-3 overflow-hidden">
          <div className="row-span-2 min-h-0">
            <Panel panel={panels[0]} index={0} registerVideo={registerVideo} onPrimaryPlay={handlePrimaryPlay} onPrimaryPause={handlePrimaryPause} />
          </div>
          <Panel panel={panels[1]} index={1} registerVideo={registerVideo} onPrimaryPlay={handlePrimaryPlay} onPrimaryPause={handlePrimaryPause} />
          <Panel panel={panels[2]} index={2} registerVideo={registerVideo} onPrimaryPlay={handlePrimaryPlay} onPrimaryPause={handlePrimaryPause} />
        </main>
      ) : (
        <main className={`grid flex-1 gap-3 overflow-hidden ${gridClass(panels.length)}`}>
          {panels.map((panel, i) => (
            <Panel key={panel.scene.id} panel={panel} index={i} registerVideo={registerVideo} onPrimaryPlay={handlePrimaryPlay} onPrimaryPause={handlePrimaryPause} />
          ))}
        </main>
      )}
    </div>
  );
}
