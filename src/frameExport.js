import {totalFrames} from './model.js';

export function frameTarget(project, frame) {
  const safeFrame = Math.min(Math.max(0, Math.floor(frame)), totalFrames(project.clips) - 1);
  let start = 0;
  for (const clip of project.clips) {
    if (safeFrame < start + clip.frames) {
      const localFrame = safeFrame - start;
      const sceneSeconds = clip.frames / project.settings.fps;
      const sourceDuration = clip.trimEnd - clip.trimStart;
      const rate = clip.timing === 'speed' ? sourceDuration / sceneSeconds : 1;
      const liveFrames = Math.min(clip.frames, Math.max(1, Math.ceil(sourceDuration * project.settings.fps / rate)));
      const sourceFrame = Math.min(localFrame, liveFrames - 1);
      return {clip, localFrame, sourceTime: clip.trimStart + (sourceFrame / project.settings.fps) * rate};
    }
    start += clip.frames;
  }
  throw new Error('Não há um quadro disponível para salvar.');
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível ler a imagem do quadro.'));
    image.src = url;
  });
}

function loadVideoFrame(url, time) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    let settled = false;
    const timer = setTimeout(() => finish(new Error('Não foi possível decodificar o quadro do vídeo em 20 segundos.')), 20000);
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(video);
    };
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => { video.currentTime = Math.max(0, Math.min(time, Math.max(0, video.duration - 0.001))); };
    video.onseeked = () => finish();
    video.onerror = () => finish(new Error('O navegador não conseguiu decodificar este vídeo.'));
    video.src = url;
  });
}

export function drawFittedFrame(context, media, width, height, fit) {
  context.fillStyle = '#000';
  context.fillRect(0, 0, width, height);
  const sourceWidth = media.videoWidth || media.naturalWidth;
  const sourceHeight = media.videoHeight || media.naturalHeight;
  if (fit === 'stretch') {
    context.drawImage(media, 0, 0, width, height);
    return;
  }
  const factor = fit === 'cover' ? Math.max(width / sourceWidth, height / sourceHeight) : Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * factor;
  const drawHeight = sourceHeight * factor;
  context.drawImage(media, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

export async function exportFrame(project, frame) {
  const {settings} = project;
  const target = frameTarget(project, frame);
  const media = target.clip.asset.kind === 'image' ? await loadImage(target.clip.asset.url) : await loadVideoFrame(target.clip.asset.url, target.sourceTime);
  const canvas = document.createElement('canvas');
  canvas.width = Number(settings.width);
  canvas.height = Number(settings.height);
  drawFittedFrame(canvas.getContext('2d'), media, canvas.width, canvas.height, settings.fit);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Não foi possível criar a imagem do quadro.');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `eleva-quadro-${String(Math.max(0, Math.floor(frame)) + 1).padStart(6, '0')}-${settings.width}x${settings.height}.png`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return {name: anchor.download, size: blob.size};
}
