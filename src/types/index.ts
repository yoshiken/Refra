// インデックスファイル (/meta/index.json) の型
export interface IndexFile {
  version: number;
  updatedAt: string;
  assets: AssetIndexEntry[];
  folders: FolderMeta[];
}

export interface AssetIndexEntry {
  id: string;
  name: string;
  type: 'image' | 'video';
  thumbnailPath: string;
  folderId: string | null;
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FolderMeta {
  id: string;
  name: string;
  parentId: string | null;
  createdBy: string;
  createdAt: string;
}

// 個別メタデータ (/meta/{assetId}.json) の型
export interface AssetMeta {
  id: string;
  name: string;
  type: 'image' | 'video';
  originalPath: string;
  thumbnailPath: string;
  folderId: string | null;
  tags: string[];
  sourceUrl: string | null;
  sourceUrlMeta: SourceUrlMeta | null;
  resolution: { width: number; height: number } | null;
  duration: number | null;
  scenes: SceneMeta[];
  comments: CommentMeta[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SourceUrlMeta {
  title: string;
  channel: string;
  url: string;
}

export interface SceneMeta {
  id: string;
  startTime: number;
  endTime: number;
  clipPath: string;
  thumbnailPath: string;
  createdBy: string;
  createdAt: string;
}

export interface CommentMeta {
  id: string;
  text: string;
  author: string;
  timestamp: number | null; // null = 全体コメント, 数値 = タイムスタンプ付き
  createdAt: string;
}

// ローカル設定 (IndexedDB)
export interface LocalSettings {
  theme: 'dark' | 'light';
  thumbnailSize: number;
  locale: string;
}
