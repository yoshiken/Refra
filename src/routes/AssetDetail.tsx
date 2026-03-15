import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deleteFile } from '@/services/storage';
import { getAssetMeta, putAssetMeta, removeFromIndex } from '@/services/metadata';
import type { AssetMeta, CommentMeta } from '@/types';

export default function AssetDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [asset, setAsset] = useState<AssetMeta | null>(null);
  const [etag, setEtag] = useState('');
  const [comment, setComment] = useState('');
  const [timestamp, setTimestamp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getAssetMeta(id);
        setAsset(res.data);
        setEtag(res.etag);
      } catch (e) {
        setError(e instanceof Error ? e.message : '詳細取得に失敗しました');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const sortedComments = useMemo(() => {
    if (!asset) return [];
    return [...asset.comments].sort((a, b) => (a.timestamp ?? -1) - (b.timestamp ?? -1));
  }, [asset]);

  const saveMeta = async (next: AssetMeta) => {
    await putAssetMeta(next, etag);
    const latest = await getAssetMeta(next.id);
    setAsset(latest.data);
    setEtag(latest.etag);
  };

  const addComment = async () => {
    if (!asset || !comment.trim()) return;
    const newComment: CommentMeta = {
      id: crypto.randomUUID(),
      text: comment.trim(),
      author: 'local-user',
      timestamp: timestamp === '' ? null : Number(timestamp),
      createdAt: new Date().toISOString(),
    };
    await saveMeta({ ...asset, comments: [...asset.comments, newComment], updatedAt: new Date().toISOString() });
    setComment('');
    setTimestamp('');
  };

  const deleteComment = async (commentId: string) => {
    if (!asset) return;
    await saveMeta({
      ...asset,
      comments: asset.comments.filter((item) => item.id !== commentId),
      updatedAt: new Date().toISOString(),
    });
  };

  const handleDeleteAsset = async () => {
    if (!asset) return;
    const ok = window.confirm('このアセットを削除しますか？');
    if (!ok) return;

    const originalKey = asset.originalPath.replace(/^\//, '');
    const thumbnailKey = asset.thumbnailPath.replace(/^\//, '');
    await deleteFile(originalKey);
    await deleteFile(thumbnailKey);
    for (const scene of asset.scenes) {
      await deleteFile(scene.clipPath.replace(/^\//, ''));
      await deleteFile(scene.thumbnailPath.replace(/^\//, ''));
    }
    await deleteFile(`meta/${asset.id}.json`);
    await removeFromIndex(asset.id);
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-950 p-8 text-white">
      <header className="mb-6">
        <Link to="/" className="text-sm text-gray-300 hover:underline">
          ← ギャラリーへ戻る
        </Link>
      </header>
      {error && <p className="mb-4 rounded border border-red-600 bg-red-950/50 p-3 text-sm">{error}</p>}
      {loading && <p className="text-sm text-gray-400">読み込み中...</p>}
      {asset && (
        <main className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <section className="rounded border border-gray-800 bg-gray-900 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold">{asset.name}</h1>
                <p className="text-xs text-gray-400">{asset.tags.join(', ') || 'タグなし'}</p>
              </div>
              <button
                type="button"
                className="rounded border border-red-700 px-3 py-2 text-xs text-red-300"
                onClick={() => void handleDeleteAsset()}
              >
                削除
              </button>
            </div>
            {asset.type === 'image' ? (
              <img src={asset.originalPath} alt={asset.name} className="max-h-[70vh] w-full rounded object-contain" />
            ) : (
              <video src={asset.originalPath} controls className="w-full rounded" />
            )}
            {asset.sourceUrl && (
              <p className="mt-3 text-xs text-gray-400">
                引用元: <a href={asset.sourceUrl} className="underline">{asset.sourceUrl}</a>
              </p>
            )}
          </section>

          <section className="rounded border border-gray-800 bg-gray-900 p-4">
            <h2 className="mb-3 text-lg font-semibold">コメント</h2>
            <div className="mb-3 max-h-[45vh] space-y-2 overflow-auto pr-1">
              {sortedComments.map((item) => (
                <article key={item.id} className="rounded border border-gray-700 p-2 text-sm">
                  <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
                    <span>{item.author}</span>
                    <button type="button" className="text-red-300" onClick={() => void deleteComment(item.id)}>
                      削除
                    </button>
                  </div>
                  {item.timestamp !== null && <p className="text-xs text-blue-300">時刻: {item.timestamp.toFixed(1)}秒</p>}
                  <p>{item.text}</p>
                </article>
              ))}
              {sortedComments.length === 0 && <p className="text-sm text-gray-500">コメントはまだありません。</p>}
            </div>

            <div className="space-y-2">
              <textarea
                className="h-24 w-full rounded border border-gray-700 bg-gray-950 p-2 text-sm"
                placeholder="コメントを入力"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              {asset.type === 'video' && (
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  className="w-full rounded border border-gray-700 bg-gray-950 p-2 text-sm"
                  placeholder="タイムスタンプ（秒、任意）"
                  value={timestamp}
                  onChange={(e) => setTimestamp(e.target.value)}
                />
              )}
              <button
                type="button"
                className="rounded bg-gray-200 px-3 py-2 text-sm font-semibold text-gray-900"
                onClick={() => void addComment()}
              >
                コメント追加
              </button>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
