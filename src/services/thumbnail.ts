// サムネイル生成
// spec.md §5.2 準拠
export async function generateImageThumbnail(image: HTMLImageElement): Promise<Blob> {
  if (image.naturalWidth === 0 || image.naturalHeight === 0) {
    throw new Error('Invalid image size');
  }

  const targetWidth = 200;
  const targetHeight = Math.round((image.naturalHeight / image.naturalWidth) * targetWidth);
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to generate thumbnail'));
        return;
      }
      resolve(blob);
    }, 'image/webp', 0.8);
  });
}

export function generateVideoPreview(video: HTMLVideoElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      reject(new Error('Invalid video size'));
      return;
    }

    const targetWidth = 200;
    const targetHeight = Math.round((video.videoHeight / video.videoWidth) * targetWidth);
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const stream = canvas.captureStream();
    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp8',
      videoBitsPerSecond: 200_000,
    });

    const chunks: Blob[] = [];
    let stopped = false;
    let stopTimer: number | null = null;
    let animId: number | null = null;

    const stopOnce = () => {
      if (stopped) return;
      stopped = true;
      if (animId !== null) {
        cancelAnimationFrame(animId);
      }
      if (stopTimer !== null) {
        clearTimeout(stopTimer);
      }
      video.pause();
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    };

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: 'video/webm' }));
    };
    recorder.onerror = () => reject(new Error('MediaRecorder error'));

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas not supported'));
      return;
    }

    const maxDuration = Math.min(5, video.duration || 5);
    video.currentTime = 0;
    recorder.start();

    const drawFrame = () => {
      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
      if (video.currentTime < maxDuration && !video.ended) {
        animId = requestAnimationFrame(drawFrame);
      } else {
        stopOnce();
      }
    };

    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      void video.play().then(() => {
        animId = requestAnimationFrame(drawFrame);
        stopTimer = window.setTimeout(() => {
          stopOnce();
        }, maxDuration * 1000);
      }).catch((error: unknown) => {
        stopOnce();
        reject(error instanceof Error ? error : new Error('動画プレビュー再生に失敗しました'));
      });
    };

    video.addEventListener('seeked', onSeeked);
    video.currentTime = 0;
  });
}

export async function generateVideoThumbnail(video: HTMLVideoElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('error', onError);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('seeked', onSeeked);
    };

    const onError = () => {
      cleanup();
      reject(new Error('Failed to load video'));
    };

    const onSeeked = () => {
      cleanup();

      if (video.videoWidth === 0 || video.videoHeight === 0) {
        reject(new Error('Invalid video size'));
        return;
      }

      const targetWidth = 200;
      const targetHeight = Math.round((video.videoHeight / video.videoWidth) * targetWidth);
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas not supported'));
        return;
      }

      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to generate video thumbnail'));
          return;
        }
        resolve(blob);
      }, 'image/webp', 0.8);
    };

    const onLoadedMetadata = () => {
      const seekTime =
        Number.isFinite(video.duration) && video.duration > 0 ? Math.min(1, video.duration / 2) : 0;
      video.currentTime = seekTime;
    };

    video.addEventListener('error', onError);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('seeked', onSeeked);

    if (video.readyState >= 1) {
      onLoadedMetadata();
    }
  });
}
