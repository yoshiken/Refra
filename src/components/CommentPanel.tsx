import { useMemo, useState } from 'react';
import type { CommentMeta } from '@/types';

interface CommentPanelProps {
  comments: CommentMeta[];
  isVideo: boolean;
  currentTime?: number;
  onAddComment: (text: string, timestamp: number | null) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onSeekToTimestamp?: (time: number) => void;
}

export default function CommentPanel({
  comments,
  isVideo,
  currentTime = 0,
  onAddComment,
  onDeleteComment,
  onSeekToTimestamp,
}: CommentPanelProps) {
  const [comment, setComment] = useState('');
  const [useTimestamp, setUseTimestamp] = useState(true);
  const [tsMode, setTsMode] = useState<'current' | 'custom'>('current');
  const [customTs, setCustomTs] = useState('');

  const sortedComments = useMemo(
    () => [...comments].sort((a, b) => (a.timestamp ?? -1) - (b.timestamp ?? -1)),
    [comments]
  );

  const resolvedTimestamp = (): number | null => {
    if (!isVideo || !useTimestamp) return null;
    if (tsMode === 'current') return currentTime;
    const v = Number(customTs);
    return customTs.trim() !== '' && Number.isFinite(v) ? v : null;
  };

  return (
    <section className="rounded border border-border-primary bg-bg-secondary p-4">
      <h2 className="mb-3 text-lg font-semibold">コメント</h2>
      <div className="mb-3 max-h-[45vh] space-y-2 overflow-auto pr-1">
        {sortedComments.map((item) => (
          <article key={item.id} className="rounded border border-border-primary p-2 text-sm">
            <div className="mb-1 flex items-center justify-between text-xs text-text-secondary">
              <span>{item.author}</span>
              <button type="button" className="text-red-500" onClick={() => void onDeleteComment(item.id)}>
                削除
              </button>
            </div>
            {item.timestamp !== null && (
              <button
                type="button"
                className="mb-1 text-xs text-blue-500 underline-offset-2 hover:underline"
                onClick={() => onSeekToTimestamp?.(item.timestamp as number)}
                title="このフレームへ移動"
              >
                時刻: {item.timestamp.toFixed(3)}秒
              </button>
            )}
            <p>{item.text}</p>
          </article>
        ))}
        {sortedComments.length === 0 && <p className="text-sm text-text-secondary">コメントはまだありません。</p>}
      </div>

      <div className="space-y-2">
        <textarea
          className="h-24 w-full rounded border border-border-primary bg-bg-primary p-2 text-sm"
          placeholder="コメントを入力"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        {isVideo && (
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useTimestamp}
                onChange={(e) => setUseTimestamp(e.target.checked)}
              />
              タイムスタンプを入れる
            </label>
            {useTimestamp && (
              <div className="ml-5 space-y-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="tsMode"
                    value="current"
                    checked={tsMode === 'current'}
                    onChange={() => setTsMode('current')}
                  />
                  今のフレーム（{currentTime.toFixed(3)}秒）
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="tsMode"
                    value="custom"
                    checked={tsMode === 'custom'}
                    onChange={() => setTsMode('custom')}
                  />
                  任意の秒数
                </label>
                {tsMode === 'custom' && (
                  <input
                    type="number"
                    min={0}
                    step={0.001}
                    className="ml-5 w-40 rounded border border-border-primary bg-bg-primary p-1 text-sm"
                    placeholder="秒数を入力"
                    value={customTs}
                    onChange={(e) => setCustomTs(e.target.value)}
                  />
                )}
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          className="rounded bg-bg-tertiary px-3 py-2 text-sm font-semibold"
          onClick={async () => {
            if (!comment.trim()) return;
            await onAddComment(comment.trim(), resolvedTimestamp());
            setComment('');
            setCustomTs('');
          }}
        >
          コメント追加
        </button>
      </div>
    </section>
  );
}
