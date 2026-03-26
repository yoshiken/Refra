import { useEffect, useRef, type DragEvent, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { getS3Url } from '@/lib/s3Client';
import { getVideoBlobUrl } from '@/lib/videoBlobCache';
import type { SceneIndexEntry } from '@/types';

interface ThumbnailCardProps {
  scene: SceneIndexEntry;
  compareMode: boolean;
  isSelectedForCompare: boolean;
  onToggleCompare: (sceneId: string) => void;
  onContextMenu: (event: MouseEvent, scene: SceneIndexEntry) => void;
}

export default function ThumbnailCard({
  scene,
  compareMode,
  isSelectedForCompare,
  onToggleCompare,
  onContextMenu,
}: ThumbnailCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (scene.assetType !== 'video' || !el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const video = videoRef.current;
        if (!video) return;
        if (entry.isIntersecting) {
          getVideoBlobUrl(getS3Url(scene.previewPath ?? scene.originalPath))
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
  }, [scene.previewPath, scene.originalPath, scene.assetType]);

  const handleDragStart = (e: DragEvent<HTMLElement>) => {
    e.dataTransfer.setData('sceneId', scene.id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <article
      ref={cardRef}
      draggable={compareMode}
      onDragStart={compareMode ? handleDragStart : undefined}
      className={`overflow-hidden rounded border border-border-primary bg-bg-secondary ${compareMode ? 'cursor-grab active:cursor-grabbing' : ''} ${isSelectedForCompare ? 'ring-2 ring-blue-500' : ''}`}
      onContextMenu={(e) => onContextMenu(e, scene)}
    >
      <Link to={`/scene/${scene.assetId}/${scene.id}`} className="block aspect-video bg-bg-tertiary">
        <video
          ref={videoRef}
          preload="none"
          muted
          loop
          playsInline
          className="h-full w-full object-cover"
        />
      </Link>
      {compareMode && (
        <div className="p-1">
          <button
            type="button"
            className={`w-full rounded px-2 py-1 text-xs ${isSelectedForCompare ? 'bg-blue-500/20 font-semibold text-blue-400' : 'bg-bg-primary'}`}
            onClick={() => onToggleCompare(scene.id)}
          >
            {isSelectedForCompare ? '比較選択済み' : '比較に追加'}
          </button>
        </div>
      )}
    </article>
  );
}
