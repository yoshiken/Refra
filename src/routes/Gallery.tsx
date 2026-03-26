import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { List, type RowComponentProps } from 'react-window';
import FolderTree from '@/components/FolderTree';
import TagFilter from '@/components/TagFilter';
import ThumbnailCard from '@/components/ThumbnailCard';
import ContextMenu, { type ContextMenuItem } from '@/components/ContextMenu';
import { addCompareAsset, clearCompareAssets, getCompareAssets } from '@/stores/compareStore';
import { getS3Url } from '@/lib/s3Client';
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

const CARD_GAP = 8; // gap-2
const CARD_LABEL = 4; // border のみ（テキストなし）

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
  const [isDragOver, setIsDragOver] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextState | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
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
    const el = viewportRef.current;
    if (!el) return;
    const updateSize = () => {
      setViewportWidth(el.clientWidth);
      setViewportHeight(el.clientHeight);
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  });

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

  const columnCount = viewportWidth > 0
    ? Math.max(1, Math.floor((viewportWidth + CARD_GAP) / (thumbnailSize + CARD_GAP)))
    : 1;
  const cardWidth = viewportWidth > 0
    ? (viewportWidth - CARD_GAP * (columnCount - 1)) / columnCount
    : thumbnailSize;
  const rowHeight = Math.round(cardWidth * (9 / 16)) + CARD_LABEL;
  const rowCount = Math.ceil(filteredScenes.length / columnCount);

  const Row = ({ index, style }: RowComponentProps<object>) => {
    const start = index * columnCount;
    const rowScenes = filteredScenes.slice(start, start + columnCount);
    return (
      <div
        style={{ ...style, gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
        className="grid gap-2"
        aria-label={`row-${index}`}
      >
        {rowScenes.map((scene) => (
          <ThumbnailCard
            key={scene.id}
            scene={scene}
            compareMode={compareMode}
            isSelectedForCompare={compareIds.includes(scene.id)}
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
                      await syncScenesForAsset(next.id, next.name, next.type, next.originalPath, next.previewPath, next.scenes);
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
                      await syncScenesForAsset(next.id, next.name, next.type, next.originalPath, next.previewPath, next.scenes);
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

  const toggleCompare = async (sceneId: string) => {
    try {
      const next = await addCompareAsset(sceneId);
      setCompareIds(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : '比較モード更新に失敗しました');
    }
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const sceneId = e.dataTransfer.getData('sceneId');
    if (!sceneId || compareIds.includes(sceneId) || compareIds.length >= 4) return;
    const next = await addCompareAsset(sceneId);
    setCompareIds(next);
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
              <>
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => { void handleDrop(e); }}
                  className={`min-h-16 rounded border-2 border-dashed p-2 transition-colors ${isDragOver ? 'border-blue-400 bg-blue-500/10' : 'border-border-primary'}`}
                >
                  {compareIds.length === 0 ? (
                    <p className="text-center text-xs text-text-secondary">ここにシーンをドロップ（最大4件）</p>
                  ) : (
                    <div className="space-y-1">
                      {compareIds.map((sceneId) => {
                        const s = scenes.find((sc) => sc.id === sceneId);
                        return s ? (
                          <div key={sceneId} className="flex items-center gap-1">
                            <img src={getS3Url(s.thumbnailPath)} alt={s.name} className="h-8 w-12 flex-shrink-0 rounded object-cover" />
                            <span className="min-w-0 flex-1 truncate text-xs">{s.name}</span>
                            <button
                              type="button"
                              className="flex-shrink-0 text-xs text-text-secondary hover:text-text-primary"
                              onClick={() => void toggleCompare(sceneId)}
                            >
                              ×
                            </button>
                          </div>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
                {compareIds.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="w-full rounded bg-blue-600 px-2 py-2 text-sm font-semibold text-white hover:bg-blue-500"
                      onClick={() => navigate('/compare')}
                    >
                      比較ページへ（{compareIds.length}/4）
                    </button>
                    <button
                      type="button"
                      className="w-full rounded border border-border-primary px-2 py-1 text-xs"
                      onClick={async () => {
                        const next = await clearCompareAssets();
                        setCompareIds(next);
                      }}
                    >
                      クリア
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </aside>

        <main
          ref={viewportRef}
          className="h-[calc(100vh-190px)] overflow-hidden rounded border border-border-primary bg-bg-secondary p-3"
        >
          {loading ? (
            <p className="text-sm text-text-secondary">読み込み中...</p>
          ) : filteredScenes.length === 0 ? (
            <p className="text-sm text-text-secondary">シーンがありません。</p>
          ) : (
            <List
              rowCount={rowCount}
              rowHeight={rowHeight}
              rowComponent={Row}
              rowProps={{}}
              style={{ height: viewportHeight }}
            />
          )}
        </main>
      </div>

      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />}
    </div>
  );
}
