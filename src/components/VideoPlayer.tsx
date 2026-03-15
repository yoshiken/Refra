import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { CommentMeta, SceneMeta } from '@/types';

export interface VideoPlayerRef {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  currentTime: () => number;
}

interface VideoPlayerProps {
  src: string;
  comments: CommentMeta[];
  scenes: SceneMeta[];
  duration: number | null;
  autoPlay?: boolean;
  loop?: boolean;
  onTimeUpdate?: (currentTime: number) => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(function VideoPlayer(
  { src, comments, scenes, duration, autoPlay = false, loop = false, onTimeUpdate },
  ref
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mediaDuration, setMediaDuration] = useState(0);
  const effectiveDuration = duration ?? mediaDuration;

  useImperativeHandle(ref, () => ({
    play: () => {
      void videoRef.current?.play();
    },
    pause: () => {
      videoRef.current?.pause();
    },
    seek: (time: number) => {
      if (!videoRef.current) return;
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    },
    currentTime: () => videoRef.current?.currentTime ?? 0,
  }));

  const timestampComments = useMemo(
    () => comments.filter((comment) => comment.timestamp !== null) as Array<CommentMeta & { timestamp: number }>,
    [comments]
  );

  return (
    <div className="space-y-2">
      <video
        ref={videoRef}
        src={src}
        autoPlay={autoPlay}
        loop={loop}
        className="w-full rounded border border-border-primary bg-black"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onLoadedMetadata={(e) => {
          setMediaDuration(e.currentTarget.duration || 0);
        }}
        onTimeUpdate={(e) => {
          const time = e.currentTarget.currentTime;
          setCurrentTime(time);
          if (onTimeUpdate) onTimeUpdate(time);
        }}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded border border-border-primary px-2 py-1 text-xs"
          onClick={() => {
            if (!videoRef.current) return;
            if (videoRef.current.paused) {
              void videoRef.current.play();
            } else {
              videoRef.current.pause();
            }
          }}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <div className="relative flex-1">
          <input
            type="range"
            min={0}
            max={effectiveDuration || 0}
            step={0.1}
            value={Math.min(currentTime, effectiveDuration || currentTime)}
            onChange={(e) => {
              const time = Number(e.target.value);
              if (videoRef.current) {
                videoRef.current.currentTime = time;
              }
              setCurrentTime(time);
            }}
            className="w-full"
          />
          <div className="pointer-events-none absolute inset-0">
            {scenes.map((scene) => {
              if (!effectiveDuration) return null;
              const left = (scene.startTime / effectiveDuration) * 100;
              const width = ((scene.endTime - scene.startTime) / effectiveDuration) * 100;
              return (
                <span
                  key={scene.id}
                  className="absolute top-0 h-full bg-blue-500/20"
                  style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                />
              );
            })}
          </div>
          {timestampComments.map((comment) => {
            if (!effectiveDuration) return null;
            const left = (comment.timestamp / effectiveDuration) * 100;
            return (
              <button
                key={comment.id}
                type="button"
                className="absolute top-[-2px] z-10 h-3 w-3 -translate-x-1/2 rounded-full bg-amber-400"
                style={{ left: `${left}%` }}
                onClick={() => {
                  if (!videoRef.current) return;
                  videoRef.current.currentTime = comment.timestamp;
                }}
                title={comment.text}
              />
            );
          })}
        </div>
        <span className="min-w-32 text-right text-xs text-text-secondary">
          {formatTime(currentTime)} / {formatTime(effectiveDuration)}
        </span>
      </div>
    </div>
  );
});

export default VideoPlayer;
