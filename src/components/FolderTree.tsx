import { useMemo, useState } from 'react';
import type { FolderMeta } from '@/types';

interface FolderTreeProps {
  folders: FolderMeta[];
  selectedFolderId: string | null;
  onSelect: (folderId: string | null) => void;
}

interface FolderNodeProps {
  folder: FolderMeta;
  folders: FolderMeta[];
  selectedFolderId: string | null;
  onSelect: (folderId: string | null) => void;
  depth: number;
}

function FolderNode({ folder, folders, selectedFolderId, onSelect, depth }: FolderNodeProps) {
  const childFolders = useMemo(
    () => folders.filter((candidate) => candidate.parentId === folder.id),
    [folder.id, folders]
  );
  const [expanded, setExpanded] = useState(true);
  const selected = selectedFolderId === folder.id;

  return (
    <div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="h-5 w-5 text-xs text-text-secondary disabled:opacity-0"
          onClick={() => setExpanded((prev) => !prev)}
          disabled={childFolders.length === 0}
        >
          {expanded ? '▼' : '▶'}
        </button>
        <button
          type="button"
          className={`rounded px-2 py-1 text-left text-sm ${
            selected ? 'bg-bg-tertiary font-semibold' : 'hover:bg-bg-tertiary'
          }`}
          style={{ marginLeft: depth * 8 }}
          onClick={() => onSelect(folder.id)}
        >
          {folder.name}
        </button>
      </div>
      {expanded &&
        childFolders.map((child) => (
          <FolderNode
            key={child.id}
            folder={child}
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

export default function FolderTree({ folders, selectedFolderId, onSelect }: FolderTreeProps) {
  const roots = useMemo(() => folders.filter((folder) => folder.parentId === null), [folders]);

  return (
    <div className="space-y-1">
      <button
        type="button"
        className={`w-full rounded px-2 py-1 text-left text-sm ${
          selectedFolderId === null ? 'bg-bg-tertiary font-semibold' : 'hover:bg-bg-tertiary'
        }`}
        onClick={() => onSelect(null)}
      >
        すべて
      </button>
      {roots.map((folder) => (
        <FolderNode
          key={folder.id}
          folder={folder}
          folders={folders}
          selectedFolderId={selectedFolderId}
          onSelect={onSelect}
          depth={0}
        />
      ))}
    </div>
  );
}
