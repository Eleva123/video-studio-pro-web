import {finalArgs, segmentArgs, totalFrames, validateProject, verifyOutput} from './model.js';

export class ExportEngine {
  ffmpeg = null;
  loading = null;
  cancelled = false;
  logs = [];
  async load(onStatus = () => {}) {
    if (this.ffmpeg?.loaded) return this.ffmpeg;
    if (this.loading) return this.loading;
    this.cancelled = false;
    this.loading = (async () => {
      onStatus('Carregando o motor de exportação…');
      const [{FFmpeg}, {toBlobURL}] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')]);
      if (this.cancelled) throw new Error('Exportação cancelada.');
      const ffmpeg = new FFmpeg();
      this.ffmpeg = ffmpeg;
      ffmpeg.on('log', ({message}) => {this.logs.push(message); if (this.logs.length > 40) this.logs.shift();});
      const base = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
      const urls = await Promise.all([toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'), toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm')]);
      try {
        if (this.cancelled) throw new Error('Exportação cancelada.');
        await ffmpeg.load({coreURL: urls[0], wasmURL: urls[1]});
      } finally { urls.forEach(url => URL.revokeObjectURL(url)); }
      onStatus('Motor pronto');
      return ffmpeg;
    })();
    try { return await this.loading; }
    catch (error) { this.ffmpeg?.terminate(); this.ffmpeg = null; throw error; }
    finally { this.loading = null; }
  }
  cancel() { this.cancelled = true; this.ffmpeg?.terminate(); this.ffmpeg = null; }
  async run(args) {
    if (this.cancelled) throw new Error('Exportação cancelada.');
    this.logs = [];
    const code = await this.ffmpeg.exec(args);
    if (code !== 0) throw new Error(`O motor não conseguiu converter o arquivo (código ${code}). Confira o formato da mídia ou tente uma resolução menor.`);
  }
  async probe(input, result = 'eleva-probe.json') {
    const code = await this.ffmpeg.ffprobe(['-v', 'error', '-show_streams', '-show_format', '-of', 'json', input, '-o', result]);
    if (code !== 0) throw new Error('Não foi possível verificar os dados do vídeo.');
    return JSON.parse(new TextDecoder().decode(await this.ffmpeg.readFile(result)));
  }
  async export(project, onUpdate) {
    validateProject(project);
    const {settings, clips} = project;
    const ffmpeg = await this.load(message => onUpdate({message, progress: 0}));
    const paths = new Set(['eleva-list.txt', 'eleva-output.mp4', 'eleva-probe.json']);
    const frames = totalFrames(clips);
    this.cancelled = false;
    let resultUrl;
    try {
      for (let i = 0; i < clips.length; i++) {
        if (this.cancelled) throw new Error('Exportação cancelada.');
        const clip = clips[i];
        const extension = clip.asset.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || (clip.asset.kind === 'image' ? 'png' : 'mp4');
        const input = `eleva-input-${i}.${extension}`;
        const output = `eleva-scene-${i}.mkv`;
        paths.add(input); paths.add(output);
        onUpdate({message: `Preparando cena ${i + 1} de ${clips.length}…`, progress: i / (clips.length + 1)});
        await ffmpeg.writeFile(input, new Uint8Array(await clip.asset.file.arrayBuffer()));
        const probe = await this.probe(input);
        const hasAudio = clip.asset.kind === 'video' && probe.streams.some(stream => stream.codec_type === 'audio');
        const progress = ({time}) => onUpdate({message: `Exportando cena ${i + 1} de ${clips.length}…`, progress: (i + Math.min(0.98, Math.max(0, time / 1000000 / (clip.frames / settings.fps)))) / (clips.length + 1)});
        ffmpeg.on('progress', progress);
        try { await this.run(segmentArgs(clip, settings, input, output, hasAudio)); }
        finally { ffmpeg.off('progress', progress); }
        await ffmpeg.deleteFile(input); paths.delete(input);
      }
      await ffmpeg.writeFile('eleva-list.txt', new TextEncoder().encode(clips.map((_, i) => `file 'eleva-scene-${i}.mkv'`).join('\n')));
      onUpdate({message: 'Unindo as cenas e finalizando o vídeo…', progress: clips.length / (clips.length + 1)});
      await this.run(finalArgs(settings, frames, 'eleva-output.mp4'));
      onUpdate({message: 'Conferindo resolução, FPS e quantidade de quadros…', progress: 0.98});
      const probe = await this.probe('eleva-output.mp4');
      const video = verifyOutput(probe, settings, frames);
      const data = await ffmpeg.readFile('eleva-output.mp4');
      const blob = new Blob([data], {type: 'video/mp4'});
      resultUrl = URL.createObjectURL(blob);
      onUpdate({message: 'Vídeo validado. Pronto para baixar.', progress: 1});
      return {id: crypto.randomUUID(), url: resultUrl, name: `eleva-${settings.width}x${settings.height}-${settings.fps}fps-${frames}quadros.mp4`, size: blob.size, frames, fps: settings.fps, width: video.width, height: video.height, audio: settings.audio};
    } catch (error) {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      if (this.cancelled) throw new Error('Exportação cancelada. Você pode editar e exportar novamente.');
      throw error;
    } finally {
      if (ffmpeg.loaded) await Promise.allSettled([...paths].map(path => ffmpeg.deleteFile(path)));
    }
  }
}
