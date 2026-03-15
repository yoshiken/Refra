interface TagFilterProps {
  tagQuery: string;
  tagMode: 'AND' | 'OR';
  onTagQueryChange: (value: string) => void;
  onTagModeChange: (mode: 'AND' | 'OR') => void;
}

export default function TagFilter({
  tagQuery,
  tagMode,
  onTagQueryChange,
  onTagModeChange,
}: TagFilterProps) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-text-secondary">タグ（カンマ区切り）</label>
      <input
        className="w-full rounded border border-border-primary bg-bg-primary px-2 py-1 text-sm"
        placeholder="UI, 演出"
        value={tagQuery}
        onChange={(e) => onTagQueryChange(e.target.value)}
      />
      <div className="flex gap-2 text-xs">
        <button
          type="button"
          className={`rounded px-2 py-1 ${tagMode === 'OR' ? 'bg-bg-tertiary font-semibold' : 'bg-bg-primary'}`}
          onClick={() => onTagModeChange('OR')}
        >
          OR
        </button>
        <button
          type="button"
          className={`rounded px-2 py-1 ${tagMode === 'AND' ? 'bg-bg-tertiary font-semibold' : 'bg-bg-primary'}`}
          onClick={() => onTagModeChange('AND')}
        >
          AND
        </button>
      </div>
    </div>
  );
}
