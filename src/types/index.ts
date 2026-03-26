// インデックスファイル (/meta/index.json) の型
export interface IndexFile {
  version: number;
  updatedAt: string;
  assets: AssetIndexEntry[];
  scenes: SceneIndexEntry[];
  folders: FolderMeta[];
}

export interface AssetIndexEntry {
  id: string;
  name: string;
  type: 'image' | 'video';
  thumbnailPath: string;
  originalPath: string;
  previewPath: string | null;
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
  previewPath: string | null;
  folderId: string | null;
  tags: string[];
  sourceUrl: string | null;
  sourceUrlMeta: SourceUrlMeta | null;
  resolution: { width: number; height: number } | null;
  duration: number | null;
  scenes: SceneMeta[];
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
  assetId: string;
  name: string;
  tags: string[];
  folderId: string | null;
  startTime: number;
  endTime: number;
  thumbnailPath: string;
  previewPath: string | null;
  comments: CommentMeta[];
  createdBy: string;
  createdAt: string;
}

export interface SceneIndexEntry {
  id: string;
  assetId: string;
  assetName: string;
  name: string;
  tags: string[];
  thumbnailPath: string;
  originalPath: string;
  previewPath: string | null;
  startTime: number;
  endTime: number;
  folderId: string | null;
  assetType: 'image' | 'video';
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
