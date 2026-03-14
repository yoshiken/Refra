// メタデータ構造定義
export interface AssetMeta {
  id: string;
  name: string;
  type: 'image' | 'video';
  tags: string[];
  folder: string;
  scenes: SceneMeta[];
  comments: CommentMeta[];
  duration?: number;
  thumbnailUrl: string;
  assetUrl: string;
  sourceUrl?: string;
}

export interface SceneMeta {
  id: string;
  start: number;
  end: number;
  description?: string;
}

export interface CommentMeta {
  id: string;
  user: string;
  text: string;
  timestamp: number | null;
  createdAt: string;
}

