import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { List, type RowComponentProps } from 'react-window';
import FolderTree from '@/components/FolderTree';
import TagFilter from '@/components/TagFilter';
import ThumbnailCard from '@/components/ThumbnailCard';
import ContextMenu, { type ContextMenuItem } from '@/components/ContextMenu';
import { addCompareAsset, clearCompareAssets, getCompareAssets } from '@/stores/compareStore';
import { getSettings } from '@/stores/settingsStore';
import { getAssetMeta, getIndex, putAssetMeta, removeFromIndex, saveIndex, updateIndex } from '@/services/metadata';
import type { AssetMeta } from '@/types';
import { deleteFile } from '@/services/storage';
import type { AssetIndexEntry, FolderMeta } from '@/types';

function normalizeTagInput(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

interface HoverPreview {
  asset: AssetIndexEntry;
  x: number;
  y: number;
}

interface ContextState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

const CARD_PADDING = 14;
const CARD_LABEL = 72;

export default function Gallery() {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<AssetIndexEntry[]>([]);
  const [folders, setFolders] = useState<FolderMeta[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tagQuery, setTagQuery] = useState('');
  const [tagMode, setTagMode] = useState<'AND' | 'OR'>('OR');
  const [thumbnailSize, setThumbnailSize] = useState(200);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [folderName, setFolderName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoverPreview, setHoverPreview] = useState<HoverPreview | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextState | null>(null);
  const [viewportWidth, setViewportWidth] = useState(900);
  const [viewportHeight, setViewportHeight] = useState(600);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: index }, settings, compare] = await Promise.all([getIndex(), getSettings(), getCompareAssets()]);
      setAssets(index.assets);
      setFolders(index.folders);
      setThumbnailSize(settings.thumbnailSize);
      setCompareIds(compare);
    } catch (e) {
      setError(e instanceof Error ? e.message : '一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAll();
  }, []);

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
        aria-label={`row-${index}`}
      >
        {rowAssets.map((asset) => (
          <ThumbnailCard
            key={asset.id}
            asset={asset}
            compareMode={compareMode}
            isSelectedForCompare={compareIds.includes(asset.id)}
            onToggleCompare={toggleCompare}
            onHoverStart={(target, x, y) => setHoverPreview({ asset: target, x, y })}
            onHoverEnd={() => setHoverPreview(null)}
            onContextMenu={(e, target) => {
              e.preventDefault();
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                items: [
                  {
                    label: 'フォルダ移動',
                    onClick: async () => {
                      const nextFolderId = window.prompt('移動先フォルダID（空で解除）', target.folderId ?? '');
                      if (nextFolderId === null) return;
                      const detail = await getAssetMeta(target.id);
                      await putAssetToFolder(detail.data, nextFolderId.trim() || null);
                      await fetchAll();
                    },
                  },
                  {
                    label: 'タグ編集',
                    onClick: () => navigate(`/asset/${target.id}`),
                  },
                  {
                    label: '削除',
                    onClick: () => {
                      void deleteFromGallery(target);
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

  const createFolder = async () => {
    if (!folderName.trim()) return;
    try {
      const { data: index, etag } = await getIndex();
      const nextFolder: FolderMeta = {
        id: crypto.randomUUID(),
        name: folderName.trim(),
        parentId: null,
        createdBy: 'local-user',
        createdAt: new Date().toISOString(),
      };
      index.folders.push(nextFolder);
      index.updatedAt = new Date().toISOString();
      await saveIndex(index, etag);
      setFolderName('');
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'フォルダ作成に失敗しました');
    }
  };

  const toggleCompare = async (assetId: string) => {
    try {
      const next = await addCompareAsset(assetId);
      setCompareIds(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : '比較モード更新に失敗しました');
    }
  };

  const deleteFromGallery = async (asset: AssetIndexEntry) => {
    const ok = window.confirm(`「${asset.name}」を削除しますか？`);
    if (!ok) return;
    const detail = await getAssetMeta(asset.id);
    await deleteFile(detail.data.originalPath.replace(/^\//, ''));
    await deleteFile(detail.data.thumbnailPath.replace(/^\//, ''));
    for (const scene of detail.data.scenes) {
      await deleteFile(scene.clipPath.replace(/^\//, ''));
      await deleteFile(scene.thumbnailPath.replace(/^\//, ''));
    }
    await deleteFile(`meta/${asset.id}.json`);
    await removeFromIndex(asset.id);
    await fetchAll();
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
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded border border-border-primary bg-bg-primary px-2 py-1 text-sm"
                placeholder="新規フォルダ名"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
              />
              <button type="button" onClick={createFolder} className="rounded bg-bg-tertiary px-2 py-1 text-xs font-semibold">
                作成
              </button>
            </div>
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

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={compareMode} onChange={(e) => setCompareMode(e.target.checked)} />
              比較モード
            </label>
            {compareMode && (
              <button
                type="button"
                className="w-full rounded bg-bg-tertiary px-2 py-2 text-sm font-semibold disabled:opacity-60"
                disabled={compareIds.length === 0}
                onClick={() => {
                  if (compareIds.length === 0) return;
                  navigate('/compare');
                }}
              >
                比較表示へ（{compareIds.length}/4）
              </button>
            )}
            {compareMode && compareIds.length > 0 && (
              <button
                type="button"
                className="w-full rounded border border-border-primary px-2 py-2 text-xs"
                onClick={async () => {
                  const next = await clearCompareAssets();
                  setCompareIds(next);
                }}
              >
                比較選択をクリア
              </button>
            )}
          </div>
        </aside>

        <main className="rounded border border-border-primary bg-bg-secondary p-3">
          {loading ? (
            <p className="text-sm text-text-secondary">読み込み中...</p>
          ) : filteredAssets.length === 0 ? (
            <p className="text-sm text-text-secondary">該当アセットがありません。</p>
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

      {hoverPreview && (
        <div
          className="pointer-events-none fixed z-40 w-72 overflow-hidden rounded border border-border-primary bg-bg-secondary shadow-xl"
          style={{ left: hoverPreview.x + 16, top: Math.max(16, hoverPreview.y - 120) }}
        >
          <img src={hoverPreview.asset.thumbnailPath} alt={hoverPreview.asset.name} className="h-40 w-full object-cover" />
          <p className="p-2 text-sm">{hoverPreview.asset.name}</p>
        </div>
      )}

      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />}
    </div>
  );

  async function putAssetToFolder(asset: AssetMeta, folderId: string | null) {
    const updatedAt = new Date().toISOString();
    const next = { ...asset, folderId, updatedAt };
    await saveIndexEntry(next);
  }

  async function saveIndexEntry(asset: AssetMeta) {
    await putAssetMeta(asset);
    await updateIndex({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      thumbnailPath: asset.thumbnailPath,
      folderId: asset.folderId,
      tags: asset.tags,
      createdBy: asset.createdBy,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    });
  }
}
