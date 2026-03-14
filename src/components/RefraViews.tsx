// サムネイル一覧画面（メイン）
import React from 'react';

export const ThumbnailGrid: React.FC = () => {
  return (
    <div className='thumbnail-grid'>
      {/* サムネイル表示・サイズスライダー・比較モードトグル */}
    </div>
  );
};

// 詳細画面（個別アセット）
export const AssetDetail: React.FC = () => {
  return (
    <div className='asset-detail'>
      {/* 画像/動画表示・コメント・タグ編集・削除・引用元 */}
    </div>
  );
};

// 比較モード画面
export const CompareView: React.FC = () => {
  return (
    <div className='compare-view'>
      {/* 複数アセット比較・同期/個別再生・コメント表示 */}
    </div>
  );
};

