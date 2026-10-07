// Executa o mesmo core WebAssembly do navegador, sem interface gráfica.
import test, {after, before} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import createFFmpegCore from '@ffmpeg/core';
import {ExportEngine} from '../src/exporter.js';
import {DEFAULT_SETTINGS, verifyOutput} from '../src/model.js';
const require = createRequire(import.meta.url);
let core, engine;
function execute(args, probing = false) {
  core.setTimeout(15000);
  core[probing ? 'ffprobe' : 'exec'](...args);
  const code = core.ret;
  core.reset();
  return code;
}
function clip(input, frames, overrides = {}) {
  const bytes = core.FS.readFile(input);
  return {frames, timing: 'hold', trimStart: 0, trimEnd: input.endsWith('.mp4') ? 2 : 0, asset: {kind: input.endsWith('.mp4') ? 'video' : 'image', duration: 2, name: input, file: new File([bytes], input)}, ...overrides};
}
async function checkResult(result) {
  const bytes = new Uint8Array(await (await fetch(result.url)).arrayBuffer());
  core.FS.writeFile('validated.mp4', bytes);
  const report = await engine.probe('validated.mp4', 'independent-probe.json');
  verifyOutput(report, DEFAULT_SETTINGS, result.frames);
  URL.revokeObjectURL(result.url);
  return report;
}
before(async () => {
  globalThis.self = {location: {href: import.meta.url}};
  core = await createFFmpegCore({wasmBinary: readFileSync(require.resolve('@ffmpeg/core/wasm'))});
  const ffmpeg = {
    loaded: true,
    async exec(args) {return execute(args);},
    async ffprobe(args) {return execute(args, true);},
    async writeFile(path, bytes) {core.FS.writeFile(path, bytes);},
    async readFile(path) {return core.FS.readFile(path);},
    async deleteFile(path) {core.FS.unlink(path);},
    on() {}, off() {}, terminate() {this.loaded = false;},
  };
  engine = new ExportEngine(); engine.ffmpeg = ffmpeg;
  for (const color of ['red', 'green', 'blue']) assert.equal(execute(['-f', 'lavfi', '-i', `color=c=${color}:s=320x180`, '-frames:v', '1', `${color}.png`]), 0);
  assert.equal(execute(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', 'short.mp4']), 0);
});
after(() => {delete globalThis.self;});
test('exportador completo aceita o relatório ffprobe válido e gera 300 quadros de imagem', async () => {
  const result = await engine.export({settings: DEFAULT_SETTINGS, clips: [clip('red.png', 300)]}, () => {});
  const report = await checkResult(result);
  assert.equal(report.streams[0].nb_frames, '300');
  assert.equal(Number(report.streams[0].duration), 10);
  assert.equal(core.FS.readdir('/').some(name => name.startsWith('eleva-')), false, 'limpa arquivos de trabalho');
});
test('exportador WebAssembly completa vídeo curto com exatamente 300 quadros', async () => {
  const result = await engine.export({settings: DEFAULT_SETTINGS, clips: [clip('short.mp4', 300)]}, () => {});
  const report = await checkResult(result);
  assert.equal(report.streams[0].avg_frame_rate, '30/1');
  assert.equal(report.streams[0].nb_frames, '300');
});
test('três cenas no WebAssembly totalizam 10 segundos', async () => {
  const result = await engine.export({settings: DEFAULT_SETTINGS, clips: ['red', 'green', 'blue'].map(color => clip(`${color}.png`, 100))}, () => {});
  const report = await checkResult(result);
  assert.equal(Number(report.streams[0].duration), 10);
  assert.equal(report.streams[0].nb_frames, '300');
});
test('mídia inválida não reutiliza relatório antigo nem oferece falso sucesso', async () => {
  await assert.rejects(() => engine.probe('inexistente.mp4'), /verificar/);
  const invalid = clip('red.png', 300); invalid.asset.file = new File(['arquivo inválido'], 'red.png');
  await assert.rejects(() => engine.export({settings: DEFAULT_SETTINGS, clips: [invalid]}, () => {}), /verificar/);
  assert.equal(core.FS.readdir('/').some(name => name.startsWith('eleva-')), false);
});
