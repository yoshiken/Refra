import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { clearCompareAssets, getCompareAssets } from '@/stores/compareStore';
import { getAssetMeta } from '@/services/metadata';
import type { AssetMeta } from '@/types';

function gridClass(count: number): string {
  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-1 lg:grid-cols-2';
  if (count === 3) return 'grid-cols-1 lg:grid-cols-2';
  return 'grid-cols-1 md:grid-cols-2';
}

export default function Compare() {
  const [assets, setAssets] = useState<AssetMeta[]>([]);
  const [syncMode, setSyncMode] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="min-h-screen bg-gray-950 p-6 text-white">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="text-sm text-gray-300 hover:underline">
          ← 一覧へ戻る
        </Link>
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
            className="rounded border border-gray-700 px-3 py-1 text-xs"
          >
            選択クリア
          </button>
        </div>
      </header>

      {error && <p className="mb-4 rounded border border-red-700 bg-red-950/30 p-3 text-sm">{error}</p>}
      {assets.length === 0 && <p className="text-sm text-gray-400">比較対象がありません。一覧で選択してください。</p>}

      <main className={`grid gap-3 ${gridClass(assets.length)}`}>
        {assets.map((asset) => (
          <section key={asset.id} className="rounded border border-gray-800 bg-gray-900 p-3">
            <p className="mb-2 text-sm font-semibold">{asset.name}</p>
            {asset.type === 'image' ? (
              <img src={asset.originalPath} alt={asset.name} className="max-h-[60vh] w-full rounded object-contain" />
            ) : (
              <video src={asset.originalPath} controls className="w-full rounded" />
            )}
            <p className="mt-2 text-xs text-gray-400">
              コメント（表示のみ）: {asset.comments.length}件 / モード: {syncMode ? '同期' : '個別'}
            </p>
          </section>
        ))}
      </main>
    </div>
  );
}
