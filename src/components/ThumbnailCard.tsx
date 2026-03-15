import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import type { AssetIndexEntry } from '@/types';

interface ThumbnailCardProps {
  asset: AssetIndexEntry;
  compareMode: boolean;
  isSelectedForCompare: boolean;
  onToggleCompare: (assetId: string) => void;
  onHoverStart: (asset: AssetIndexEntry, x: number, y: number) => void;
  onHoverEnd: () => void;
  onContextMenu: (event: MouseEvent, asset: AssetIndexEntry) => void;
}

export default function ThumbnailCard({
  asset,
  compareMode,
  isSelectedForCompare,
  onToggleCompare,
  onHoverStart,
  onHoverEnd,
  onContextMenu,
}: ThumbnailCardProps) {
  return (
    <article
      className="overflow-hidden rounded border border-border-primary bg-bg-secondary"
      onMouseEnter={(e) => onHoverStart(asset, e.clientX, e.clientY)}
      onMouseMove={(e) => onHoverStart(asset, e.clientX, e.clientY)}
      onMouseLeave={onHoverEnd}
      onContextMenu={(e) => onContextMenu(e, asset)}
    >
      <Link to={`/asset/${asset.id}`} className="block">
        <img src={asset.thumbnailPath} alt={asset.name} className="h-auto w-full bg-bg-tertiary object-cover" />
      </Link>
      <div className="space-y-1 p-2 text-xs">
        <p className="truncate font-semibold">{asset.name}</p>
        <p className="truncate text-text-secondary">{asset.tags.join(', ') || 'タグなし'}</p>
        {compareMode && (
          <button
            type="button"
            className={`w-full rounded px-2 py-1 ${isSelectedForCompare ? 'bg-bg-tertiary font-semibold' : 'bg-bg-primary'}`}
            onClick={() => onToggleCompare(asset.id)}
          >
            {isSelectedForCompare ? '比較選択済み' : '比較に追加'}
          </button>
        )}
      </div>
    </article>
  );
}
