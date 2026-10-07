import {createId} from './id.js';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp']);
export async function readAsset(file) {
  const kind = IMAGE_TYPES.has(file.type) ? 'image' : file.type.startsWith('video/') ? 'video' : null;
  if (!kind) throw new Error(`“${file.name}”: use PNG, JPG, WebP, BMP ou um arquivo de vídeo.`);
  if (file.size > 250 * 1024 * 1024) throw new Error(`“${file.name}” ultrapassa o limite de 250 MB por arquivo.`);
  const url = URL.createObjectURL(file);
  try {
    const media = document.createElement(kind === 'image' ? 'img' : 'video');
    if (kind === 'video') { media.preload = 'metadata'; media.muted = true; }
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Não foi possível ler este arquivo em 20 segundos.')), 20000);
      media[kind === 'image' ? 'onload' : 'onloadedmetadata'] = () => {clearTimeout(timer); resolve();};
      media.onerror = () => {clearTimeout(timer); reject(new Error('Formato inválido ou não suportado por este navegador.'));};
      media.src = url;
    });
    const width = kind === 'image' ? media.naturalWidth : media.videoWidth;
    const height = kind === 'image' ? media.naturalHeight : media.videoHeight;
    const duration = kind === 'image' ? 0 : media.duration;
    if (!width || !height || !Number.isFinite(duration)) throw new Error('O arquivo não possui dimensões ou duração válidas.');
    return {id: createId(), file, name: file.name, url, kind, width, height, duration};
  } catch (error) { URL.revokeObjectURL(url); throw new Error(`“${file.name}”: ${error.message}`); }
}
