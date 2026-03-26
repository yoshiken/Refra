import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { CommentMeta, SceneMeta } from '@/types';

export interface VideoPlayerRef {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  currentTime: () => number;
  getVideoElement: () => HTMLVideoElement | null;
}

interface VideoPlayerProps {
  src: string;
  comments?: CommentMeta[];
  scenes: SceneMeta[];
  duration: number | null;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  expanded?: boolean;
  rangeStart?: number;
  rangeEnd?: number;
  showFrameStrip?: boolean;
  preloadAllFrames?: boolean;
  onTimeUpdate?: (currentTime: number) => void;
  onSetStart?: (time: number) => void;
  onSetEnd?: (time: number) => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function formatFrameTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00.000';
  const ms = Math.round((seconds % 1) * 1000);
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function findNearestIndex(frames: { time: number }[], target: number): number {
  if (frames.length === 0) return -1;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].time < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return 0;
  const prev = lo - 1;
  return Math.abs(frames[lo].time - target) <= Math.abs(frames[prev].time - target) ? lo : prev;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
const FRAME_STEP = 1 / 30;
const HALF_WINDOW = 10;

const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(function VideoPlayer(
  {
    src, comments = [], scenes, duration, autoPlay = false, loop = false, muted = false,
    expanded = false, rangeStart, rangeEnd, showFrameStrip, preloadAllFrames,
    onTimeUpdate, onSetStart, onSetEnd,
  },
  ref
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [isMuted, setIsMuted] = useState(muted);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('videoPlayerVolume');
    return saved !== null ? Number(saved) : 1;
  });

  // オンデマンドフレームストリップ（SceneEditor / AssetDetail 用）
  const [stripFrames, setStripFrames] = useState<{ time: number; dataUrl: string }[]>([]);
  const [isGeneratingStrip, setIsGeneratingStrip] = useState(false);
  const cancelledRef = useRef(false);
  const captureVideoRef = useRef<HTMLVideoElement | null>(null);
  const stripCacheRef = useRef<Map<string, string>>(new Map()); // time key → dataUrl
  const isSeeking = useRef(false); // シークバーD&D中フラグ

  // 全フレーム先行キャプチャ（SceneDetail 用）
  const [allFrames, setAllFrames] = useState<{ time: number; dataUrl: string }[]>([]);
  const preloadCancelRef = useRef(false);
  const preloadVideoRef = useRef<HTMLVideoElement | null>(null);

  // 再生中フラグ（preload ループが参照する ref）
  const isPlayingRef = useRef(false);

  // アクティブフレームへの auto-scroll 用 ref
  const activeFrameRef = useRef<HTMLButtonElement | null>(null);

  const effectiveDuration = duration ?? mediaDuration;
  const effectiveRangeStart = rangeStart ?? 0;
  const effectiveRangeEnd = rangeEnd ?? effectiveDuration;
  const rangeWidth = effectiveRangeEnd - effectiveRangeStart;

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
    localStorage.setItem('videoPlayerVolume', String(volume));
  }, [volume]);

  // src 変更時：オンデマンドストリップとキャッシュをリセット
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (captureVideoRef.current) captureVideoRef.current.src = '';
      setStripFrames([]);
      setIsGeneratingStrip(false);
      stripCacheRef.current.clear();
    };
  }, [src]);

  // preloadAllFrames: シーン全区間のフレームを並列キャプチャ
  useEffect(() => {
    preloadCancelRef.current = true;
    if (preloadVideoRef.current) preloadVideoRef.current.src = '';
    setAllFrames([]);

    if (!preloadAllFrames || rangeStart === undefined || rangeEnd === undefined || !src) return;

    setIsGeneratingStrip(true);

    const times: number[] = [];
    for (let t = rangeStart; ; t = parseFloat((t + FRAME_STEP).toFixed(4))) {
      const clamped = Math.min(t, rangeEnd);
      if (times.length > 0 && Math.abs(times[times.length - 1] - clamped) < 0.001) break;
      times.push(clamped);
      if (clamped >= rangeEnd) break;
    }

    preloadCancelRef.current = false;

    const WORKER_COUNT = 4;
    const results = new Array<{ time: number; dataUrl: string } | null>(times.length).fill(null);
    const workers: HTMLVideoElement[] = [];
    let doneCount = 0;
    let capturedCount = 0;

    const onAllReady = (videoWidth: number, videoHeight: number) => {
      const w = 80;
      const h = Math.max(1, Math.round((videoHeight / videoWidth) * w));

      // ワーカーごとに担当するインデックスを割り振り
      const chunks: number[][] = Array.from({ length: WORKER_COUNT }, () => []);
      for (let i = 0; i < times.length; i++) {
        chunks[i % WORKER_COUNT].push(i);
      }

      const runWorker = (workerIdx: number) => {
        const video = workers[workerIdx];
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const indices = chunks[workerIdx];
        let pos = 0;

        const captureNext = () => {
          if (preloadCancelRef.current) return;
          if (pos >= indices.length) {
            doneCount++;
            if (doneCount >= WORKER_COUNT) {
              const final = results.filter((r): r is { time: number; dataUrl: string } => r !== null);
              setAllFrames(final);
              setIsGeneratingStrip(false);
            }
            return;
          }
          const idx = indices[pos];
          video.onseeked = () => {
            if (preloadCancelRef.current) return;
            ctx.drawImage(video, 0, 0, w, h);
            results[idx] = { time: times[idx], dataUrl: canvas.toDataURL('image/jpeg', 0.6) };
            capturedCount++;
            // 50フレームごとに部分更新
            if (capturedCount % 50 === 0) {
              setAllFrames(results.filter((r): r is { time: number; dataUrl: string } => r !== null));
            }
            pos++;
            setTimeout(captureNext, 0);
          };
          video.currentTime = times[idx];
        };

        captureNext();
      };

      for (let i = 0; i < WORKER_COUNT; i++) {
        runWorker(i);
      }
    };

    // ワーカー用video要素を並列で生成
    let readyCount = 0;
    for (let i = 0; i < WORKER_COUNT; i++) {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.preload = 'auto';
      video.src = src;
      workers.push(video);

      video.onloadedmetadata = () => {
        if (preloadCancelRef.current) return;
        readyCount++;
        if (readyCount >= WORKER_COUNT) {
          onAllReady(workers[0].videoWidth, workers[0].videoHeight);
        }
      };
      video.load();
    }

    preloadVideoRef.current = workers[0];

    return () => {
      preloadCancelRef.current = true;
      for (const v of workers) v.src = '';
    };
  }, [src, rangeStart, rangeEnd, preloadAllFrames]);

  // アクティブフレームが常に見えるように auto-scroll
  useEffect(() => {
    if (activeFrameRef.current) {
      activeFrameRef.current.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
    }
  }, [currentTime]);

  const generateStrip = useCallback((centerTime: number) => {
    if (!onSetStart) return;

    const times: number[] = [];
    for (let i = -HALF_WINDOW; i <= HALF_WINDOW; i++) {
      const t = parseFloat(Math.max(0, Math.min(effectiveDuration || 9999, centerTime + i * FRAME_STEP)).toFixed(4));
      if (times.length === 0 || Math.abs(times[times.length - 1] - t) > 0.001) {
        times.push(t);
      }
    }

    const cache = stripCacheRef.current;
    const timeKey = (t: number) => t.toFixed(4);

    // キャッシュから取得できるフレームと未生成のフレームを分離
    const cached: { time: number; dataUrl: string }[] = [];
    const missing: { index: number; time: number }[] = [];
    for (let i = 0; i < times.length; i++) {
      const key = timeKey(times[i]);
      const hit = cache.get(key);
      if (hit) {
        cached[i] = { time: times[i], dataUrl: hit };
      } else {
        missing.push({ index: i, time: times[i] });
      }
    }

    // 全てキャッシュヒット
    if (missing.length === 0) {
      setStripFrames(times.map((_t, i) => cached[i]));
      setIsGeneratingStrip(false);
      return;
    }

    // キャッシュ済みフレームで即座に表示を更新
    const results = times.map((t, i) => cached[i] || { time: t, dataUrl: '' });
    setStripFrames(results.filter((r) => r.dataUrl));
    setIsGeneratingStrip(true);

    cancelledRef.current = true;
    // 既存のcaptureVideoがあれば再利用、なければ新規作成
    let captureVideo = captureVideoRef.current;
    const needNewVideo = !captureVideo || !captureVideo.src || captureVideo.src !== src;

    if (needNewVideo) {
      if (captureVideo) captureVideo.src = '';
      captureVideo = document.createElement('video');
      captureVideoRef.current = captureVideo;
      captureVideo.crossOrigin = 'anonymous';
      captureVideo.muted = true;
      captureVideo.preload = 'auto';
      captureVideo.src = src;
    }

    cancelledRef.current = false;

    const startCapture = () => {
      if (cancelledRef.current || !captureVideo) return;
      const w = 160;
      const h = Math.max(1, Math.round((captureVideo.videoHeight / captureVideo.videoWidth) * w));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let pos = 0;
      const captureNext = () => {
        if (cancelledRef.current || pos >= missing.length) {
          setStripFrames(times.map((t) => ({ time: t, dataUrl: cache.get(timeKey(t)) ?? '' })).filter((r) => r.dataUrl));
          setIsGeneratingStrip(false);
          return;
        }
        const { index, time } = missing[pos];
        captureVideo!.onseeked = () => {
          if (cancelledRef.current) return;
          ctx.drawImage(captureVideo!, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/webp', 0.7);
          cache.set(timeKey(time), dataUrl);
          results[index] = { time, dataUrl };
          setStripFrames(results.filter((r) => r.dataUrl));
          pos++;
          captureNext();
        };
        captureVideo!.currentTime = time;
      };
      captureNext();
    };

    if (needNewVideo) {
      captureVideo!.onloadedmetadata = () => {
        if (!cancelledRef.current) startCapture();
      };
      captureVideo!.load();
    } else {
      startCapture();
    }
  }, [src, effectiveDuration, onSetStart]);

  const stepFrame = useCallback((direction: 1 | -1) => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    const clampMin = rangeStart ?? 0;
    const clampMax = rangeEnd ?? effectiveDuration;
    const newTime = parseFloat(
      Math.max(clampMin, Math.min(clampMax, currentTime + direction * FRAME_STEP)).toFixed(4)
    );
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    if (!preloadAllFrames) generateStrip(newTime);
  }, [currentTime, effectiveDuration, rangeStart, rangeEnd, preloadAllFrames, generateStrip]);

  useImperativeHandle(ref, () => ({
    play: () => { void videoRef.current?.play(); },
    pause: () => { videoRef.current?.pause(); },
    seek: (time: number) => {
      if (!videoRef.current) return;
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    },
    currentTime: () => videoRef.current?.currentTime ?? 0,
    getVideoElement: () => videoRef.current,
  }));

  // 表示するフレーム（allFrames のスライス、またはオンデマンド stripFrames）
  const displayFrames = useMemo(() => {
    if (preloadAllFrames && allFrames.length > 0) {
      const nearestIdx = findNearestIndex(allFrames, currentTime);
      const start = Math.max(0, nearestIdx - HALF_WINDOW);
      const end = Math.min(allFrames.length, nearestIdx + HALF_WINDOW + 1);
      return allFrames.slice(start, end);
    }
    return stripFrames;
  }, [preloadAllFrames, allFrames, stripFrames, currentTime]);

  const nearestFrameIndex = useMemo(
    () => findNearestIndex(displayFrames, currentTime),
    [displayFrames, currentTime]
  );

  const timestampComments = useMemo(
    () => comments.filter((c) => c.timestamp !== null) as Array<CommentMeta & { timestamp: number }>,
    [comments]
  );

  const showStrip = showFrameStrip || (!!onSetStart && !isPlaying);

  return (
    <div className="space-y-1">
      <video
        ref={videoRef}
        src={src}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        className={`w-full rounded border border-border-primary bg-black object-contain ${expanded ? 'max-h-[85vh]' : 'max-h-[60vh]'}`}
        onPlay={() => { setIsPlaying(true); isPlayingRef.current = true; }}
        onPause={(e) => {
          setIsPlaying(false);
          isPlayingRef.current = false;
          if (!preloadAllFrames && !isSeeking.current) generateStrip(e.currentTarget.currentTime);
        }}
        onLoadedMetadata={(e) => {
          setMediaDuration(e.currentTarget.duration || 0);
        }}
        onTimeUpdate={(e) => {
          const time = e.currentTarget.currentTime;
          setCurrentTime(time);
          if (onTimeUpdate) onTimeUpdate(time);
        }}
      />

      {/* コントロールバー */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded border border-border-primary px-2 py-1 text-xs"
          onClick={() => {
            if (!videoRef.current) return;
            if (videoRef.current.paused) void videoRef.current.play();
            else videoRef.current.pause();
          }}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        {onSetStart && (
          <>
            <button
              type="button"
              className="rounded border border-border-primary px-2 py-1 text-xs"
              onClick={() => stepFrame(-1)}
              title="1フレーム戻る"
            >
              ◀│
            </button>
            <button
              type="button"
              className="rounded border border-border-primary px-2 py-1 text-xs"
              onClick={() => stepFrame(1)}
              title="1フレーム進む"
            >
              │▶
            </button>
          </>
        )}
        <button
          type="button"
          className="rounded border border-border-primary px-2 py-1 text-xs"
          onClick={() => setIsMuted((prev) => !prev)}
          title={isMuted ? 'ミュート解除' : 'ミュート'}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={isMuted ? 0 : volume}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
            if (isMuted && v > 0) setIsMuted(false);
          }}
          className="w-20"
          title={`ボリューム: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
        />
        <div className="relative flex-1">
          <input
            type="range"
            min={effectiveRangeStart}
            max={effectiveRangeEnd || effectiveRangeStart + 1}
            step={0.033}
            value={Math.max(effectiveRangeStart, Math.min(currentTime, effectiveRangeEnd || currentTime))}
            onPointerDown={() => { isSeeking.current = true; }}
            onChange={(e) => {
              const time = Number(e.target.value);
              if (videoRef.current) videoRef.current.currentTime = time;
              setCurrentTime(time);
            }}
            onPointerUp={(e) => {
              isSeeking.current = false;
              if (!isPlaying && !preloadAllFrames) {
                generateStrip(Number((e.target as HTMLInputElement).value));
              }
            }}
            className="w-full"
          />
          <div className="pointer-events-none absolute inset-0">
            {scenes.map((scene) => {
              if (!rangeWidth) return null;
              const left = ((scene.startTime - effectiveRangeStart) / rangeWidth) * 100;
              const width = ((scene.endTime - scene.startTime) / rangeWidth) * 100;
              if (left > 100 || left + width < 0) return null;
              return (
                <span
                  key={scene.id}
                  className="absolute top-0 h-full bg-blue-500/20"
                  style={{ left: `${Math.max(0, left)}%`, width: `${Math.max(width, 0.5)}%` }}
                />
              );
            })}
          </div>
          {timestampComments.map((comment) => {
            if (!rangeWidth) return null;
            if (comment.timestamp < effectiveRangeStart || comment.timestamp > effectiveRangeEnd) return null;
            const left = ((comment.timestamp - effectiveRangeStart) / rangeWidth) * 100;
            return (
              <button
                key={comment.id}
                type="button"
                className="absolute top-[-2px] z-10 h-3 w-3 -translate-x-1/2 rounded-full bg-amber-400"
                style={{ left: `${left}%` }}
                onClick={() => {
                  if (!videoRef.current) return;
                  videoRef.current.currentTime = comment.timestamp;
                  videoRef.current.pause();
                }}
                title={comment.text}
              />
            );
          })}
        </div>
        <span className="min-w-28 text-right text-xs text-text-secondary">
          {formatTime(currentTime - effectiveRangeStart)} / {formatTime(rangeWidth || effectiveDuration)}
        </span>
        {onSetStart && (
          <button
            type="button"
            className="rounded border border-border-primary px-2 py-1 text-xs"
            onClick={() => onSetStart(currentTime)}
            title="現在位置を開始点に設定"
          >
            Start
          </button>
        )}
        {onSetEnd && (
          <button
            type="button"
            className="rounded border border-border-primary px-2 py-1 text-xs"
            onClick={() => onSetEnd(currentTime)}
            title="現在位置を終了点に設定"
          >
            End
          </button>
        )}
        <select
          value={speed}
          onChange={(e) => {
            const s = Number(e.target.value);
            setSpeed(s);
            if (videoRef.current) videoRef.current.playbackRate = s;
          }}
          className="rounded border border-border-primary bg-bg-primary px-1 py-1 text-xs"
          title="再生速度"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>{s}x</option>
          ))}
        </select>
      </div>

      {/* フレームストリップ */}
      {showStrip && (
        <div className="space-y-1">
          {isGeneratingStrip && displayFrames.length === 0 && (
            <p className="text-xs text-text-secondary">フレーム生成中...</p>
          )}
          {displayFrames.length > 0 && (
            <>
              <p className="text-xs text-text-secondary">
                現在位置: {formatFrameTime(currentTime - effectiveRangeStart)}
                {isGeneratingStrip && <span className="ml-2 opacity-60">生成中...</span>}
              </p>
              <div className="flex gap-1 overflow-x-auto rounded border border-border-primary bg-bg-primary p-1">
                {displayFrames.map((frame, i) => (
                  <button
                    key={frame.time}
                    ref={i === nearestFrameIndex ? activeFrameRef : undefined}
                    type="button"
                    onClick={() => {
                      if (videoRef.current) videoRef.current.currentTime = frame.time;
                      setCurrentTime(frame.time);
                      if (!preloadAllFrames) generateStrip(frame.time);
                    }}
                    className={`flex-shrink-0 rounded border-2 p-0 transition-colors ${
                      i === nearestFrameIndex
                        ? 'border-blue-500'
                        : 'border-transparent hover:border-border-primary'
                    }`}
                    title={formatFrameTime(frame.time - effectiveRangeStart)}
                  >
                    <img
                      src={frame.dataUrl}
                      alt={formatFrameTime(frame.time - effectiveRangeStart)}
                      className="block h-[54px] rounded object-cover"
                    />
                    <p className="text-center text-[8px] text-text-secondary">
                      {formatFrameTime(frame.time - effectiveRangeStart)}
                    </p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export default VideoPlayer;
