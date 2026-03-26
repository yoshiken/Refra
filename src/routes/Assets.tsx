import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { List, type RowComponentProps } from 'react-window';
import FolderTree from '@/components/FolderTree';
import TagFilter from '@/components/TagFilter';
import ContextMenu, { type ContextMenuItem } from '@/components/ContextMenu';
import { getSettings } from '@/stores/settingsStore';
import { getAssetMeta, getIndex, putAssetMeta, removeFromIndex, syncScenesForAsset, updateIndex } from '@/services/metadata';
import { deleteFile } from '@/services/storage';
import { getS3Url } from '@/lib/s3Client';
import { getVideoBlobUrl } from '@/lib/videoBlobCache';
import type { AssetIndexEntry, AssetMeta, FolderMeta } from '@/types';

function normalizeTagInput(value: string): string[] {
  return value.split(',').map((t) => t.trim()).filter(Boolean);
}

interface ContextState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

interface AssetCardProps {
  asset: AssetIndexEntry;
  onContextMenu: (e: MouseEvent<HTMLElement>, asset: AssetIndexEntry) => void;
}

function AssetCard({ asset, onContextMenu }: AssetCardProps) {
  const ref = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (asset.type !== 'video' || !asset.previewPath || !el) return;
    const src = getS3Url(asset.previewPath);
    const observer = new IntersectionObserver(
      ([entry]) => {
        const video = videoRef.current;
        if (!video) return;
        if (entry.isIntersecting) {
          getVideoBlobUrl(src)
            .then((blobUrl) => {
              if (!videoRef.current) return;
              videoRef.current.src = blobUrl;
              videoRef.current.play().catch(() => {});
            })
            .catch(() => {});
        } else {
          video.pause();
          video.removeAttribute('src');
          video.load();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [asset.type, asset.previewPath]);

  return (
    <article
      ref={ref}
      className="overflow-hidden rounded border border-border-primary bg-bg-secondary"
      onContextMenu={(e) => onContextMenu(e, asset)}
    >
      <Link to={`/asset/${asset.id}`} className="block">
        {asset.type === 'video' && asset.previewPath ? (
          <video
            ref={videoRef}
            poster={getS3Url(asset.thumbnailPath)}
            preload="none"
            muted
            loop
            playsInline
            className="h-auto w-full bg-bg-tertiary object-cover"
          />
        ) : (
          <img
            src={getS3Url(asset.thumbnailPath)}
            alt={asset.name}
            loading="lazy"
            className="h-auto w-full bg-bg-tertiary object-cover"
          />
        )}
      </Link>
      <div className="space-y-1 p-2 text-xs">
        <p className="truncate font-semibold">{asset.name}</p>
        <p className="truncate text-text-secondary">{asset.tags.join(', ') || 'タグなし'}</p>
        <p className="truncate text-text-secondary">{asset.type === 'video' ? '動画' : '画像'}</p>
      </div>
    </article>
  );
}

const CARD_PADDING = 14;
const CARD_LABEL = 72;

export default function Assets() {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<AssetIndexEntry[]>([]);
  const [folders, setFolders] = useState<FolderMeta[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tagQuery, setTagQuery] = useState('');
  const [tagMode, setTagMode] = useState<'AND' | 'OR'>('OR');
  const [thumbnailSize, setThumbnailSize] = useState(200);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextState | null>(null);
  const [viewportWidth, setViewportWidth] = useState(900);
  const [viewportHeight, setViewportHeight] = useState(600);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: index }, settings] = await Promise.all([getIndex(), getSettings()]);
      setAssets(index.assets);
      setFolders(index.folders);
      setThumbnailSize(settings.thumbnailSize);
    } catch (e) {
      setError(e instanceof Error ? e.message : '一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchAll(); }, []);

  useEffect(() => {
    if (!viewportRef.current) return;
    const updateSize = () => {
      if (!viewportRef.current) return;
      setViewportWidth(viewportRef.current.clientWidth);
      setViewportHeight(Math.max(320, window.innerHeight - 180));
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewportRef.current);
    window.addEventListener('resize', updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  const parsedTags = useMemo(() => normalizeTagInput(tagQuery), [tagQuery]);
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const byFolder = selectedFolderId === null || asset.folderId === selectedFolderId;
      const q = search.trim().toLowerCase();
      const bySearch =
        q.length === 0 ||
        asset.name.toLowerCase().includes(q) ||
        asset.tags.some((tag) => tag.toLowerCase().includes(q));
      const byTags =
        parsedTags.length === 0 ||
        (tagMode === 'AND'
          ? parsedTags.every((tag) => asset.tags.includes(tag))
          : parsedTags.some((tag) => asset.tags.includes(tag)));
      return byFolder && bySearch && byTags;
    });
  }, [assets, selectedFolderId, search, parsedTags, tagMode]);

  const rowHeight = thumbnailSize + CARD_LABEL;
  const columnCount = Math.max(1, Math.floor(viewportWidth / (thumbnailSize + CARD_PADDING)));
  const rowCount = Math.ceil(filteredAssets.length / columnCount);

  const Row = ({ index, style }: RowComponentProps<object>) => {
    const start = index * columnCount;
    const rowAssets = filteredAssets.slice(start, start + columnCount);
    return (
      <div
        style={{ ...style, gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
        className="grid gap-2 px-1"
      >
        {rowAssets.map((asset) => (
          <AssetCard
            key={asset.id}
            asset={asset}
            onContextMenu={(e, target) => {
              e.preventDefault();
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                items: [
                  {
                    label: '詳細を開く',
                    onClick: () => navigate(`/asset/${target.id}`),
                  },
                  {
                    label: 'フォルダ移動',
                    onClick: async () => {
                      const nextFolderId = window.prompt('移動先フォルダID（空で解除）', target.folderId ?? '');
                      if (nextFolderId === null) return;
                      const detail = await getAssetMeta(target.id);
                      const next: AssetMeta = { ...detail.data, folderId: nextFolderId.trim() || null, updatedAt: new Date().toISOString() };
                      await putAssetMeta(next);
                      await updateIndex({ ...target, folderId: next.folderId, updatedAt: next.updatedAt });
                      await syncScenesForAsset(next.id, next.name, next.type, next.originalPath, next.previewPath, next.scenes);
                      await fetchAll();
                    },
                  },
                  {
                    label: '削除',
                    onClick: async () => {
                      const ok = window.confirm(`「${target.name}」を削除しますか？`);
                      if (!ok) return;
                      const detail = await getAssetMeta(target.id);
                      await deleteFile(detail.data.originalPath.replace(/^\//, ''));
                      await deleteFile(detail.data.thumbnailPath.replace(/^\//, ''));
                      if (detail.data.previewPath) {
                        await deleteFile(detail.data.previewPath.replace(/^\//, ''));
                      }
                      for (const scene of detail.data.scenes) {
                        if (scene.thumbnailPath !== detail.data.thumbnailPath) {
                          await deleteFile(scene.thumbnailPath.replace(/^\//, ''));
                        }
                      }
                      await deleteFile(`meta/${target.id}.json`);
                      await removeFromIndex(target.id);
                      await fetchAll();
                    },
                    danger: true,
                  },
                ],
              });
            }}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="p-6">
      {error && <p className="mb-4 rounded border border-red-500/50 bg-red-500/10 p-3 text-sm">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-3 rounded border border-border-primary bg-bg-secondary p-4">
          <h2 className="text-base font-semibold">絞り込み</h2>
          <input
            className="w-full rounded border border-border-primary bg-bg-primary px-2 py-1 text-sm"
            placeholder="検索（名前・タグ）"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <TagFilter
            tagQuery={tagQuery}
            tagMode={tagMode}
            onTagModeChange={setTagMode}
            onTagQueryChange={setTagQuery}
          />
          <div className="space-y-1">
            <label className="text-xs text-text-secondary">フォルダツリー</label>
            <FolderTree folders={folders} selectedFolderId={selectedFolderId} onSelect={setSelectedFolderId} />
          </div>
          <div>
            <label className="text-xs text-text-secondary">サムネイルサイズ: {thumbnailSize}px</label>
            <input
              type="range"
              min={120}
              max={320}
              step={10}
              value={thumbnailSize}
              onChange={(e) => setThumbnailSize(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </aside>

        <main className="rounded border border-border-primary bg-bg-secondary p-3">
          {loading ? (
            <p className="text-sm text-text-secondary">読み込み中...</p>
          ) : filteredAssets.length === 0 ? (
            <p className="text-sm text-text-secondary">アセットがありません。</p>
          ) : (
            <div ref={viewportRef} className="h-[calc(100vh-190px)]">
              <List
                rowCount={rowCount}
                rowHeight={rowHeight}
                rowComponent={Row}
                rowProps={{}}
                style={{ height: viewportHeight, width: viewportWidth }}
              />
            </div>
          )}
        </main>
      </div>

      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />}
    </div>
  );
}
