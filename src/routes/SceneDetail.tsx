import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteFile } from '@/services/storage';
import { getAssetMeta, getIndex, putAssetMeta, syncScenesForAsset, updateIndex } from '@/services/metadata';
import { getS3Url } from '@/lib/s3Client';
import type { AssetMeta, AssetIndexEntry, FolderMeta, SceneMeta } from '@/types';
import VideoPlayer, { type VideoPlayerRef } from '@/components/VideoPlayer';
import ImageViewer from '@/components/ImageViewer';

export default function SceneDetail() {
  const navigate = useNavigate();
  const { assetId, sceneId } = useParams<{ assetId: string; sceneId: string }>();
  const [asset, setAsset] = useState<AssetMeta | null>(null);
  const [scene, setScene] = useState<SceneMeta | null>(null);
  const [folders, setFolders] = useState<FolderMeta[]>([]);
  const [etag, setEtag] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [sceneNameDraft, setSceneNameDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loopScene, setLoopScene] = useState<SceneMeta | null>(null);
  const videoRef = useRef<VideoPlayerRef>(null);

  useEffect(() => {
    if (!assetId || !sceneId) {
      setError('シーン情報が不正です');
      setLoading(false);
      return;
    }

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [assetRes, indexRes] = await Promise.all([getAssetMeta(assetId), getIndex()]);
        const targetScene = assetRes.data.scenes.find((entry) => entry.id === sceneId);
        if (!targetScene) {
          throw new Error('シーンが見つかりません');
        }
        setAsset(assetRes.data);
        setScene(targetScene);
        setSceneNameDraft(targetScene.name);
        setLoopScene(targetScene);
        setFolders(indexRes.data.folders);
        setEtag(assetRes.etag);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'シーン詳細の取得に失敗しました');
      } finally {
        setLoading(false);
      }
    })();
  }, [assetId, sceneId]);

  const saveMeta = async (next: AssetMeta) => {
    await putAssetMeta(next, etag);
    const indexEntry: AssetIndexEntry = {
      id: next.id,
      name: next.name,
      type: next.type,
      thumbnailPath: next.thumbnailPath,
      originalPath: next.originalPath,
      previewPath: next.previewPath,
      folderId: next.folderId,
      tags: next.tags,
      createdBy: next.createdBy,
      createdAt: next.createdAt,
      updatedAt: next.updatedAt,
    };
    await updateIndex(indexEntry);
    await syncScenesForAsset(next.id, next.name, next.type, next.scenes);
    const latest = await getAssetMeta(next.id);
    const targetScene = latest.data.scenes.find((entry) => entry.id === sceneId);
    if (!targetScene) {
      navigate('/');
      return;
    }
    setAsset(latest.data);
    setScene(targetScene);
    setSceneNameDraft(targetScene.name);
    setLoopScene(targetScene);
    setEtag(latest.etag);
  };

  useEffect(() => {
    if (!scene || asset?.type !== 'video') return;
    videoRef.current?.seek(scene.startTime);
    videoRef.current?.play();
  }, [asset?.type, scene]);

  const updateCurrentScene = async (updater: (current: SceneMeta) => SceneMeta) => {
    if (!asset || !scene) return;
    const nextScene = updater(scene);
    const nextAsset: AssetMeta = {
      ...asset,
      scenes: asset.scenes.map((entry) => (entry.id === scene.id ? nextScene : entry)),
      updatedAt: new Date().toISOString(),
    };
    await saveMeta(nextAsset);
  };

  const addTag = async () => {
    if (!scene) return;
    const tag = tagInput.trim();
    if (!tag || scene.tags.includes(tag)) return;
    await updateCurrentScene((current) => ({ ...current, tags: [...current.tags, tag] }));
    setTagInput('');
  };

  const removeTag = async (tag: string) => {
    await updateCurrentScene((current) => ({
      ...current,
      tags: current.tags.filter((value) => value !== tag),
    }));
  };

  const deleteScene = async () => {
    if (!asset || !scene) return;
    const ok = window.confirm(`「${scene.name}」を削除しますか？`);
    if (!ok) return;
    if (scene.thumbnailPath !== asset.thumbnailPath) {
      await deleteFile(scene.thumbnailPath.replace(/^\//, ''));
    }
    const nextAsset: AssetMeta = {
      ...asset,
      scenes: asset.scenes.filter((entry) => entry.id !== scene.id),
      updatedAt: new Date().toISOString(),
    };
    await saveMeta(nextAsset);
    navigate('/');
  };

  return (
    <div className="p-8">
      {error && <p className="mb-4 rounded border border-red-500/50 bg-red-500/10 p-3 text-sm">{error}</p>}
      {loading && <p className="text-sm text-text-secondary">読み込み中...</p>}
      {asset && scene && (
        <main className="mx-auto max-w-5xl space-y-4 rounded border border-border-primary bg-bg-secondary p-4">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <input
                value={sceneNameDraft}
                onChange={(e) => setSceneNameDraft(e.target.value)}
                onBlur={() => {
                  const nextName = sceneNameDraft.trim();
                  if (!nextName || nextName === scene.name) {
                    setSceneNameDraft(scene.name);
                    return;
                  }
                  void updateCurrentScene((current) => ({ ...current, name: nextName }));
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  const nextName = sceneNameDraft.trim();
                  if (!nextName || nextName === scene.name) {
                    setSceneNameDraft(scene.name);
                    return;
                  }
                  void updateCurrentScene((current) => ({ ...current, name: nextName }));
                }}
                className="w-full rounded border border-border-primary bg-bg-primary px-3 py-2 text-xl font-bold"
                placeholder="シーン名"
              />
              <Link to={`/asset/${asset.id}`} className="text-sm text-text-secondary underline">
                親アセットを開く
              </Link>
            </div>
            <button
              type="button"
              className="rounded border border-red-500 px-3 py-2 text-xs text-red-500"
              onClick={() => void deleteScene()}
            >
              削除
            </button>
          </header>

          <section>
            {asset.type === 'video' ? (
              <VideoPlayer
                ref={videoRef}
                src={getS3Url(asset.originalPath)}
                comments={[]}
                scenes={asset.scenes}
                duration={asset.duration}
                autoPlay
                muted
                onTimeUpdate={(time) => {
                  if (loopScene && time >= loopScene.endTime) {
                    videoRef.current?.seek(loopScene.startTime);
                  }
                }}
              />
            ) : (
              <ImageViewer src={getS3Url(asset.originalPath)} alt={scene.name} />
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">タグ</h2>
            <div className="flex flex-wrap gap-2">
              {scene.tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-2 py-1 text-xs">
                  {tag}
                  <button type="button" onClick={() => void removeTag(tag)}>
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex max-w-md gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void addTag();
                  }
                }}
                className="min-w-0 flex-1 rounded border border-border-primary bg-bg-primary px-2 py-1 text-sm"
                placeholder="タグを追加"
              />
              <button type="button" className="rounded bg-bg-tertiary px-3 py-1 text-sm" onClick={() => void addTag()}>
                追加
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">フォルダ</h2>
            <select
              value={scene.folderId ?? ''}
              onChange={(e) => {
                const nextFolderId = e.target.value.trim() || null;
                void updateCurrentScene((current) => ({ ...current, folderId: nextFolderId }));
              }}
              className="max-w-sm rounded border border-border-primary bg-bg-primary px-2 py-1 text-sm"
            >
              <option value="">フォルダ未選択</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </section>

          {asset.type === 'video' && (
            <p className="text-sm text-text-secondary">
              タイムレンジ: {scene.startTime.toFixed(1)}s - {scene.endTime.toFixed(1)}s
            </p>
          )}
        </main>
      )}
    </div>
  );
}
