import { useMemo, useState } from 'react';
import type { CommentMeta } from '@/types';

interface CommentPanelProps {
  comments: CommentMeta[];
  isVideo: boolean;
  onAddComment: (text: string, timestamp: number | null) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
}

export default function CommentPanel({ comments, isVideo, onAddComment, onDeleteComment }: CommentPanelProps) {
  const [comment, setComment] = useState('');
  const [timestamp, setTimestamp] = useState('');

  const sortedComments = useMemo(
    () => [...comments].sort((a, b) => (a.timestamp ?? -1) - (b.timestamp ?? -1)),
    [comments]
  );

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
            {item.timestamp !== null && <p className="text-xs text-blue-500">時刻: {item.timestamp.toFixed(1)}秒</p>}
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
          <input
            type="number"
            min={0}
            step={0.1}
            className="w-full rounded border border-border-primary bg-bg-primary p-2 text-sm"
            placeholder="タイムスタンプ（秒、任意）"
            value={timestamp}
            onChange={(e) => setTimestamp(e.target.value)}
          />
        )}
        <button
          type="button"
          className="rounded bg-bg-tertiary px-3 py-2 text-sm font-semibold"
          onClick={async () => {
            if (!comment.trim()) return;
            await onAddComment(comment.trim(), timestamp === '' ? null : Number(timestamp));
            setComment('');
            setTimestamp('');
          }}
        >
          コメント追加
        </button>
      </div>
    </section>
  );
}
