import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { List, type RowComponentProps } from 'react-window';
import FolderTree from '@/components/FolderTree';
import TagFilter from '@/components/TagFilter';
import ThumbnailCard from '@/components/ThumbnailCard';
import ContextMenu, { type ContextMenuItem } from '@/components/ContextMenu';
import { addCompareAsset, clearCompareAssets, getCompareAssets } from '@/stores/compareStore';
import { getSettings } from '@/stores/settingsStore';
import { getAssetMeta, getIndex, putAssetMeta, saveIndex, syncScenesForAsset } from '@/services/metadata';
import { deleteFile } from '@/services/storage';
import type { FolderMeta, SceneIndexEntry } from '@/types';

function normalizeTagInput(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
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
  const [scenes, setScenes] = useState<SceneIndexEntry[]>([]);
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
  const [contextMenu, setContextMenu] = useState<ContextState | null>(null);
  const [viewportWidth, setViewportWidth] = useState(900);
  const [viewportHeight, setViewportHeight] = useState(600);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: index }, settings, compare] = await Promise.all([getIndex(), getSettings(), getCompareAssets()]);
      setScenes(index.scenes);
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
  const filteredScenes = useMemo(() => {
    return scenes.filter((scene) => {
      const byFolder = selectedFolderId === null || scene.folderId === selectedFolderId;
      const q = search.trim().toLowerCase();
      const bySearch =
        q.length === 0 ||
        scene.name.toLowerCase().includes(q) ||
        scene.tags.some((tag) => tag.toLowerCase().includes(q));
      const byTags =
        parsedTags.length === 0 ||
        (tagMode === 'AND'
          ? parsedTags.every((tag) => scene.tags.includes(tag))
          : parsedTags.some((tag) => scene.tags.includes(tag)));
      return byFolder && bySearch && byTags;
    });
  }, [scenes, selectedFolderId, search, parsedTags, tagMode]);

  const rowHeight = thumbnailSize + CARD_LABEL;
  const columnCount = Math.max(1, Math.floor(viewportWidth / (thumbnailSize + CARD_PADDING)));
  const rowCount = Math.ceil(filteredScenes.length / columnCount);

  const Row = ({ index, style }: RowComponentProps<object>) => {
    const start = index * columnCount;
    const rowScenes = filteredScenes.slice(start, start + columnCount);
    return (
      <div
        style={{ ...style, gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
        className="grid gap-2 px-1"
        aria-label={`row-${index}`}
      >
        {rowScenes.map((scene) => (
          <ThumbnailCard
            key={scene.id}
            scene={scene}
            compareMode={compareMode}
            isSelectedForCompare={compareIds.includes(scene.assetId)}
            onToggleCompare={toggleCompare}
            onContextMenu={(e, targetScene) => {
              e.preventDefault();
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                items: [
                  {
                    label: '親アセットを開く',
                    onClick: () => navigate(`/asset/${targetScene.assetId}`),
                  },
                  {
                    label: 'フォルダ移動',
                    onClick: async () => {
                      const nextFolderId = window.prompt('移動先フォルダID（空で解除）', targetScene.folderId ?? '');
                      if (nextFolderId === null) return;
                      const detail = await getAssetMeta(targetScene.assetId);
                      const updatedScenes = detail.data.scenes.map((sceneItem) =>
                        sceneItem.id === targetScene.id
                          ? { ...sceneItem, folderId: nextFolderId.trim() || null }
                          : sceneItem
                      );
                      const next = {
                        ...detail.data,
                        scenes: updatedScenes,
                        updatedAt: new Date().toISOString(),
                      };
                      await putAssetMeta(next);
                      await syncScenesForAsset(next.id, next.name, next.type, next.scenes);
                      await fetchAll();
                    },
                  },
                  {
                    label: '削除',
                    onClick: async () => {
                      const ok = window.confirm(`「${targetScene.name}」を削除しますか？`);
                      if (!ok) return;
                      const detail = await getAssetMeta(targetScene.assetId);
                      if (targetScene.thumbnailPath !== detail.data.thumbnailPath) {
                        await deleteFile(targetScene.thumbnailPath.replace(/^\//, ''));
                      }
                      const updatedScenes = detail.data.scenes.filter((sceneItem) => sceneItem.id !== targetScene.id);
                      const next = {
                        ...detail.data,
                        scenes: updatedScenes,
                        updatedAt: new Date().toISOString(),
                      };
                      await putAssetMeta(next);
                      await syncScenesForAsset(next.id, next.name, next.type, next.scenes);
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

  const toggleCompare = async (id: string) => {
    try {
      const next = await addCompareAsset(id);
      setCompareIds(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : '比較モード更新に失敗しました');
    }
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
          ) : filteredScenes.length === 0 ? (
            <p className="text-sm text-text-secondary">シーンがありません。</p>
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
