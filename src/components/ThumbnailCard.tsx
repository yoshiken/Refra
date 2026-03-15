import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { getS3Url } from '@/lib/s3Client';
import type { SceneIndexEntry } from '@/types';

interface ThumbnailCardProps {
  scene: SceneIndexEntry;
  compareMode: boolean;
  isSelectedForCompare: boolean;
  onToggleCompare: (id: string) => void;
  onContextMenu: (event: MouseEvent, scene: SceneIndexEntry) => void;
}

export default function ThumbnailCard({
  scene,
  compareMode,
  isSelectedForCompare,
  onToggleCompare,
  onContextMenu,
}: ThumbnailCardProps) {
  return (
    <article
      className="overflow-hidden rounded border border-border-primary bg-bg-secondary"
      onContextMenu={(e) => onContextMenu(e, scene)}
    >
      <Link to={`/scene/${scene.assetId}/${scene.id}`} className="block">
        <img src={getS3Url(scene.thumbnailPath)} alt={scene.name} className="h-auto w-full bg-bg-tertiary object-cover" />
      </Link>
      <div className="space-y-1 p-2 text-xs">
        <p className="truncate font-semibold">{scene.name}</p>
        <p className="truncate text-text-secondary">{scene.tags.join(', ') || 'タグなし'}</p>
        {scene.assetType === 'video' && (
          <p className="truncate text-text-secondary">
            {scene.startTime.toFixed(1)}s - {scene.endTime.toFixed(1)}s
          </p>
        )}
        {compareMode && (
          <button
            type="button"
            className={`w-full rounded px-2 py-1 ${isSelectedForCompare ? 'bg-bg-tertiary font-semibold' : 'bg-bg-primary'}`}
            onClick={() => onToggleCompare(scene.assetId)}
          >
            {isSelectedForCompare ? '比較選択済み' : '比較に追加'}
          </button>
        )}
      </div>
    </article>
  );
}
