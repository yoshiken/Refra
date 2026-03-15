import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getIndex, saveIndex } from '@/services/metadata';
import { getSettings } from '@/stores/settingsStore';
import type { AssetIndexEntry, FolderMeta } from '@/types';
import { addCompareAsset, clearCompareAssets, getCompareAssets } from '@/stores/compareStore';

function normalizeTagInput(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export default function Gallery() {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<AssetIndexEntry[]>([]);
  const [folders, setFolders] = useState<FolderMeta[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [tagQuery, setTagQuery] = useState('');
  const [tagMode, setTagMode] = useState<'AND' | 'OR'>('OR');
  const [thumbnailSize, setThumbnailSize] = useState(200);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [folderName, setFolderName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: index }, settings, compare] = await Promise.all([
        getIndex(),
        getSettings(),
        getCompareAssets(),
      ]);
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

  const parsedTags = useMemo(() => normalizeTagInput(tagQuery), [tagQuery]);
  const filtered = useMemo(() => {
    return assets.filter((asset) => {
      const byFolder = selectedFolderId === 'all' || asset.folderId === selectedFolderId;
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
  }, [assets, parsedTags, search, selectedFolderId, tagMode]);

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

  return (
    <div className="min-h-screen bg-gray-950 p-6 text-white">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Refra</h1>
        <nav className="flex gap-3 text-sm">
          <Link to="/upload" className="rounded border border-gray-700 px-3 py-2 hover:bg-gray-800">
            アップロード
          </Link>
          <Link to="/settings" className="rounded border border-gray-700 px-3 py-2 hover:bg-gray-800">
            設定
          </Link>
          <Link to="/compare" className="rounded border border-gray-700 px-3 py-2 hover:bg-gray-800">
            比較表示
          </Link>
        </nav>
      </header>

      {error && <p className="mb-4 rounded border border-red-600 bg-red-950/50 p-3 text-sm">{error}</p>}

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <aside className="space-y-3 rounded border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-base font-semibold">絞り込み</h2>
          <input
            className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-sm"
            placeholder="検索（名前・タグ）"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="space-y-1">
            <label className="text-xs text-gray-400">タグ（カンマ区切り）</label>
            <input
              className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-sm"
              placeholder="UI, 演出"
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
            />
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                className={`rounded px-2 py-1 ${tagMode === 'OR' ? 'bg-gray-200 text-gray-900' : 'bg-gray-800'}`}
                onClick={() => setTagMode('OR')}
              >
                OR
              </button>
              <button
                type="button"
                className={`rounded px-2 py-1 ${tagMode === 'AND' ? 'bg-gray-200 text-gray-900' : 'bg-gray-800'}`}
                onClick={() => setTagMode('AND')}
              >
                AND
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">フォルダ</label>
            <select
              className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-sm"
              value={selectedFolderId}
              onChange={(e) => setSelectedFolderId(e.target.value)}
            >
              <option value="all">すべて</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-950 px-2 py-1 text-sm"
                placeholder="新規フォルダ名"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
              />
              <button
                type="button"
                onClick={createFolder}
                className="rounded bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-900"
              >
                作成
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400">サムネイルサイズ: {thumbnailSize}px</label>
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
              <input
                type="checkbox"
                checked={compareMode}
                onChange={(e) => setCompareMode(e.target.checked)}
              />
              比較モード
            </label>
            {compareMode && (
                <button
                  type="button"
                  className="w-full rounded bg-gray-200 px-2 py-2 text-sm font-semibold text-gray-900 disabled:opacity-60"
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
                className="w-full rounded border border-gray-700 px-2 py-2 text-xs"
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

        <main>
          {loading ? (
            <p className="text-sm text-gray-400">読み込み中...</p>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailSize}px, 1fr))` }}>
              {filtered.map((asset) => (
                <article key={asset.id} className="overflow-hidden rounded border border-gray-800 bg-gray-900">
                  <Link to={`/asset/${asset.id}`} className="block">
                    <img
                      src={asset.thumbnailPath}
                      alt={asset.name}
                      className="h-auto w-full bg-gray-800 object-cover"
                    />
                  </Link>
                  <div className="space-y-1 p-2 text-xs">
                    <p className="truncate font-semibold">{asset.name}</p>
                    <p className="truncate text-gray-400">{asset.tags.join(', ') || 'タグなし'}</p>
                    {compareMode && (
                      <button
                        type="button"
                        className={`w-full rounded px-2 py-1 ${
                          compareIds.includes(asset.id) ? 'bg-gray-200 text-gray-900' : 'bg-gray-800'
                        }`}
                        onClick={() => void toggleCompare(asset.id)}
                      >
                        {compareIds.includes(asset.id) ? '比較選択済み' : '比較に追加'}
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {!loading && filtered.length === 0 && (
                <p className="text-sm text-gray-400">該当アセットがありません。</p>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
