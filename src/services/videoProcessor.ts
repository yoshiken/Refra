type FFmpegModule = typeof import('@ffmpeg/ffmpeg');
type UtilModule = typeof import('@ffmpeg/util');

let ffmpegInstance: InstanceType<FFmpegModule['FFmpeg']> | null = null;

async function loadModules(): Promise<{
  ffmpeg: InstanceType<FFmpegModule['FFmpeg']>;
  fetchFile: UtilModule['fetchFile'];
}> {
  const [{ FFmpeg }, { fetchFile }] = await Promise.all([
    import('@ffmpeg/ffmpeg'),
    import('@ffmpeg/util'),
  ]);

  if (!ffmpegInstance) {
    ffmpegInstance = new FFmpeg();
    await ffmpegInstance.load();
  }

  return {
    ffmpeg: ffmpegInstance,
    fetchFile,
  };
}

export async function cutScene(
  videoFile: File,
  startTime: number,
  endTime: number,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  const { ffmpeg, fetchFile } = await loadModules();
  const ext = videoFile.name.includes('.') ? videoFile.name.slice(videoFile.name.lastIndexOf('.')) : '.mp4';
  const inputName = `input${ext}`;
  const outputName = 'output.webm';

  ffmpeg.on('progress', ({ progress }) => {
    if (onProgress) onProgress(progress);
  });

  await ffmpeg.writeFile(inputName, await fetchFile(videoFile));
  await ffmpeg.exec([
    '-i',
    inputName,
    '-ss',
    startTime.toString(),
    '-to',
    endTime.toString(),
    '-an',
    '-c:v',
    'libvpx-vp9',
    '-b:v',
    '1M',
    outputName,
  ]);

  const data = await ffmpeg.readFile(outputName);
  const chunk = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  const copy = new Uint8Array(chunk.byteLength);
  copy.set(chunk);
  return new Blob([copy], { type: 'video/webm' });
}
