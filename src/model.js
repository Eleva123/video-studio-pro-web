export const DEFAULT_SETTINGS = {width: 600, height: 360, fps: 30, fit: 'stretch', audio: false, quality: 20};
export const PRESETS = [
  {name: 'Horizontal • 600 × 360', width: 600, height: 360},
  {name: 'Horizontal • 576 × 384', width: 576, height: 384},
  {name: 'Full HD • 1920 × 1080', width: 1920, height: 1080},
  {name: 'Vertical • 1080 × 1920', width: 1080, height: 1920},
  {name: 'Quadrado • 1080 × 1080', width: 1080, height: 1080},
];
export const secondsToFrames = (seconds, fps) => Math.max(1, Math.round(Number(seconds) * fps) || 1);
export const totalFrames = (clips) => clips.reduce((sum, clip) => sum + clip.frames, 0);
export const secondsLabel = (frames, fps) => (frames / fps).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 3});
export function timecode(frame, fps) {
  const whole = Math.floor(Math.max(0, frame) / fps);
  return [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60, Math.max(0, frame) % fps].map(n => String(n).padStart(2, '0')).join(':');
}
export function distributeFrames(frames, count) {
  if (!Number.isInteger(frames) || count < 1 || frames < count) throw new Error('Escolha um tempo com pelo menos um quadro por cena.');
  return Array.from({length: count}, (_, i) => Math.floor(frames / count) + (i < frames % count ? 1 : 0));
}
export function changeFps(project, fps) {
  return {...project, settings: {...project.settings, fps}, clips: project.clips.map(clip => ({...clip, frames: secondsToFrames(clip.frames / project.settings.fps, fps)}))};
}
export function resizeClip(clip, deltaFrames, edge, fps) {
  const delta = Math.round(Number(deltaFrames) || 0);
  if (edge === 'right') return {frames: Math.max(1, clip.frames + delta)};
  const frames = Math.max(1, clip.frames - delta);
  if (clip.asset.kind !== 'video') return {frames};
  const trimStart = Math.max(0, Math.min(clip.trimEnd - 1 / fps, clip.trimStart + delta / fps));
  return {frames: Math.max(1, frames), trimStart};
}
export function validateProject({settings, clips}) {
  for (const [key, label] of [['width', 'largura'], ['height', 'altura']]) {
    const n = Number(settings[key]);
    if (!Number.isInteger(n) || n < 2 || n > 4096 || n % 2 !== 0) throw new Error(`A ${label} precisa ser um número par entre 2 e 4096 pixels.`);
  }
  if (![24, 25, 30, 60].includes(settings.fps)) throw new Error('Escolha 24, 25, 30 ou 60 quadros por segundo.');
  if (!['stretch', 'contain', 'cover'].includes(settings.fit)) throw new Error('Escolha um modo de preenchimento válido.');
  if (![18, 20, 23].includes(settings.quality)) throw new Error('Escolha uma qualidade válida.');
  if (!clips.length) throw new Error('Adicione pelo menos uma imagem ou um vídeo.');
  for (const clip of clips) {
    if (!Number.isInteger(clip.frames) || clip.frames < 1 || clip.frames > settings.fps * 600) throw new Error('Cada cena precisa ter de 1 quadro a 10 minutos.');
    if (clip.asset.kind === 'video' && (!Number.isFinite(clip.trimStart) || !Number.isFinite(clip.trimEnd) || clip.trimStart < 0 || clip.trimEnd <= clip.trimStart || clip.trimEnd > clip.asset.duration + 0.001)) throw new Error(`Revise os cortes da cena “${clip.asset.name}”. O fim precisa ser maior que o início e caber no vídeo.`);
  }
  if (totalFrames(clips) > settings.fps * 1800) throw new Error('O projeto pode ter no máximo 30 minutos.');
  return true;
}
export function videoFilter(clip, settings) {
  const {width: w, height: h, fps, fit} = settings;
  const length = clip.frames / fps;
  const filters = [];
  if (clip.asset.kind === 'video') {
    filters.push(`trim=start=${clip.trimStart}:end=${clip.trimEnd}`, 'setpts=PTS-STARTPTS');
    if (clip.timing === 'speed') filters.push(`setpts=PTS*${length / (clip.trimEnd - clip.trimStart)}`);
  }
  if (fit === 'stretch') filters.push(`scale=${w}:${h}`);
  else if (fit === 'contain') filters.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease:force_divisible_by=2`, `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`);
  else filters.push(`scale=${w}:${h}:force_original_aspect_ratio=increase:force_divisible_by=2`, `crop=${w}:${h}`);
  filters.push('setsar=1', `fps=${fps}`, `tpad=stop_mode=clone:stop_duration=${length}`, `trim=duration=${length}`, `setpts=N/(${fps}*TB)`, 'format=yuv420p');
  return filters.join(',');
}
export function tempoFilters(rate) {
  const filters = [];
  while (rate > 2) { filters.push('atempo=2'); rate /= 2; }
  while (rate < 0.5) { filters.push('atempo=0.5'); rate /= 0.5; }
  filters.push(`atempo=${rate}`);
  return filters;
}
export function segmentArgs(clip, settings, input, output, hasAudio) {
  const length = clip.frames / settings.fps;
  const args = clip.asset.kind === 'image' ? ['-loop', '1', '-framerate', String(settings.fps), '-i', input] : ['-i', input];
  if (settings.audio && !hasAudio) args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
  args.push('-map', '0:v:0', '-vf', videoFilter(clip, settings), '-frames:v', String(clip.frames), '-r', String(settings.fps), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(settings.quality), '-pix_fmt', 'yuv420p', '-g', String(settings.fps), '-bf', '0');
  if (settings.audio) {
    const af = hasAudio ? [`atrim=start=${clip.trimStart}:end=${clip.trimEnd}`, 'asetpts=PTS-STARTPTS'] : [];
    if (hasAudio && clip.timing === 'speed') af.push(...tempoFilters((clip.trimEnd - clip.trimStart) / length));
    af.push('apad', `atrim=duration=${length}`, 'aresample=48000');
    args.push('-map', hasAudio ? '0:a:0' : '1:a:0', '-af', af.join(','), '-ac', '2', '-c:a', 'pcm_s16le', '-t', String(length));
  } else args.push('-an');
  return [...args, '-y', output];
}
export function finalArgs(settings, frames, output) {
  const args = ['-f', 'concat', '-safe', '0', '-i', 'eleva-list.txt', '-map', '0:v:0', '-vf', `fps=${settings.fps},setpts=N/(${settings.fps}*TB)`, '-frames:v', String(frames), '-r', String(settings.fps), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(settings.quality), '-pix_fmt', 'yuv420p', '-g', String(settings.fps), '-bf', '0'];
  if (settings.audio) args.push('-map', '0:a:0', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-t', String(frames / settings.fps));
  else args.push('-an');
  return [...args, '-movflags', '+faststart', '-y', output];
}
export function verifyOutput(probe, settings, frames) {
  const video = probe.streams?.find(s => s.codec_type === 'video');
  if (!video) throw new Error('O arquivo gerado não contém vídeo.');
  const [num, den] = (video.avg_frame_rate || '').split('/').map(Number);
  const duration = Number(video.duration);
  if (video.width !== Number(settings.width) || video.height !== Number(settings.height) || video.pix_fmt !== 'yuv420p' || video.codec_name !== 'h264' || !Number.isFinite(num / den) || !Number.isFinite(duration) || Math.abs(num / den - settings.fps) > 0.001 || Number(video.nb_frames) !== frames || Math.abs(duration - frames / settings.fps) > 1 / settings.fps) throw new Error('A validação encontrou uma diferença de resolução, duração ou quadros. O arquivo não foi aprovado para download.');
  return video;
}
export function readPresets(storage) {
  try {
    const saved = JSON.parse(storage.getItem('eleva-presets-v2') || '[]');
    return Array.isArray(saved) ? saved.filter(p => typeof p.name === 'string' && Number.isInteger(p.width) && Number.isInteger(p.height) && p.width >= 2 && p.height >= 2 && p.width <= 4096 && p.height <= 4096 && p.width % 2 === 0 && p.height % 2 === 0) : [];
  } catch { return []; }
}
