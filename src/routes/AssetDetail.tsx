import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deleteFile } from '@/services/storage';
import { getAssetMeta, putAssetMeta, removeFromIndex, updateIndex } from '@/services/metadata';
import type { AssetMeta, CommentMeta } from '@/types';
import ImageViewer from '@/components/ImageViewer';
import CommentPanel from '@/components/CommentPanel';

export default function AssetDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [asset, setAsset] = useState<AssetMeta | null>(null);
  const [etag, setEtag] = useState('');
  const [tagInput, setTagInput] = useState('');
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

  const saveMeta = async (next: AssetMeta) => {
    await putAssetMeta(next, etag);
    await updateIndex({
      id: next.id,
      name: next.name,
      type: next.type,
      thumbnailPath: next.thumbnailPath,
      folderId: next.folderId,
      tags: next.tags,
      createdBy: next.createdBy,
      createdAt: next.createdAt,
      updatedAt: next.updatedAt,
    });
    const latest = await getAssetMeta(next.id);
    setAsset(latest.data);
    setEtag(latest.etag);
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

  const addTag = async () => {
    if (!asset) return;
    const tag = tagInput.trim();
    if (!tag || asset.tags.includes(tag)) return;
    await saveMeta({
      ...asset,
      tags: [...asset.tags, tag],
      updatedAt: new Date().toISOString(),
    });
    setTagInput('');
  };

  const removeTag = async (tag: string) => {
    if (!asset) return;
    await saveMeta({
      ...asset,
      tags: asset.tags.filter((value) => value !== tag),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="p-8">
      {error && <p className="mb-4 rounded border border-red-500/50 bg-red-500/10 p-3 text-sm">{error}</p>}
      {loading && <p className="text-sm text-text-secondary">読み込み中...</p>}
      {asset && (
        <main className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <section className="rounded border border-border-primary bg-bg-secondary p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold">{asset.name}</h1>
                <div className="mt-2 flex flex-wrap gap-2">
                  {asset.tags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-2 py-1 text-xs">
                      {tag}
                      <button type="button" onClick={() => void removeTag(tag)}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex max-w-md gap-2">
                  <input
                    className="min-w-0 flex-1 rounded border border-border-primary bg-bg-primary px-2 py-1 text-sm"
                    placeholder="タグを追加"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void addTag();
                      }
                    }}
                  />
                  <button type="button" className="rounded bg-bg-tertiary px-3 py-1 text-sm" onClick={() => void addTag()}>
                    追加
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="rounded border border-red-500 px-3 py-2 text-xs text-red-500"
                onClick={() => void handleDeleteAsset()}
              >
                削除
              </button>
            </div>
            {asset.type === 'image' ? (
              <ImageViewer src={asset.originalPath} alt={asset.name} />
            ) : (
              <video src={asset.originalPath} controls className="w-full rounded" />
            )}
            {asset.sourceUrl && (
              <p className="mt-3 text-xs text-text-secondary">
                引用元: <a href={asset.sourceUrl} className="underline">{asset.sourceUrl}</a>
              </p>
            )}
          </section>
          <CommentPanel
            comments={asset.comments}
            isVideo={asset.type === 'video'}
            onAddComment={async (text, ts) => {
              const newComment: CommentMeta = {
                id: crypto.randomUUID(),
                text,
                author: 'local-user',
                timestamp: ts,
                createdAt: new Date().toISOString(),
              };
              await saveMeta({
                ...asset,
                comments: [...asset.comments, newComment],
                updatedAt: new Date().toISOString(),
              });
            }}
            onDeleteComment={deleteComment}
          />
        </main>
      )}
    </div>
  );
}
