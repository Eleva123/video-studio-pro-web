// Verifica mídia real. Requer ffmpeg e ffprobe instalados no computador.
import test, {after, before} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DEFAULT_SETTINGS, finalArgs, segmentArgs, verifyOutput} from '../src/model.js';
let dir;
function ffmpeg(args) {execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-filter_threads', '2', ...args.slice(0, -1), '-threads', '2', args.at(-1)], {cwd: dir, timeout: 60000});}
function probe(path) {return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], {cwd: dir}).toString());}
function render(clips, settings = DEFAULT_SETTINGS) {
  clips.forEach((clip, i) => ffmpeg(segmentArgs(clip, settings, clip.input, `eleva-scene-${i}.mkv`, !!clip.hasAudio)));
  writeFileSync(join(dir, 'eleva-list.txt'), clips.map((_, i) => `file 'eleva-scene-${i}.mkv'`).join('\n'));
  const frames = clips.reduce((n, clip) => n + clip.frames, 0);
  ffmpeg(finalArgs(settings, frames, 'out.mp4'));
  return verifyOutput(probe('out.mp4'), settings, frames);
}
function pixels(frame = 0) {return execFileSync('ffmpeg', ['-v', 'error', '-i', 'out.mp4', '-vf', `select=eq(n\\,${frame})`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {cwd: dir});}
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'eleva-test-'));
  for (const color of ['red', 'green', 'blue']) ffmpeg(['-f', 'lavfi', '-i', `color=c=${color}:s=320x180`, '-frames:v', '1', '-y', `${color}.png`]);
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', 'short.mp4']);
});
after(() => rmSync(dir, {recursive: true, force: true}));
test('imagem vira MP4 de 10 segundos, 300 quadros e ocupa as bordas', () => {
  const video = render([{input: 'red.png', asset: {kind: 'image'}, frames: 300, timing: 'hold'}]);
  assert.equal(video.nb_frames, '300'); assert.equal(Number(video.duration), 10);
  const rgb = pixels();
  for (const pos of [0, (600 * 360 - 1) * 3]) assert.ok(rgb[pos] > 200 && rgb[pos + 1] < 30 && rgb[pos + 2] < 30, 'borda preenchida pela imagem');
});
test('vídeo de 2 segundos a 25 FPS vira 10 segundos a 30 FPS e segura o último quadro', () => {
  render([{input: 'short.mp4', asset: {kind: 'video'}, trimStart: 0, trimEnd: 2, frames: 300, timing: 'hold'}]);
  const a = pixels(90), b = pixels(299);
  const meanDifference = a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length;
  assert.ok(meanDifference < 1, `Último quadro mantido; diferença média ${meanDifference}`);
});
test('três imagens mudam nos quadros 100 e 200 sem perda no começo', () => {
  render(['red', 'green', 'blue'].map(color => ({input: `${color}.png`, asset: {kind: 'image'}, frames: 100, timing: 'hold'})));
  assert.ok(pixels(99)[0] > 200);
  assert.ok(pixels(100)[1] > 90);
  assert.ok(pixels(199)[1] > 90);
  assert.ok(pixels(200)[2] > 200);
});
test('corte e mudança de velocidade mantêm áudio e número de quadros', () => {
  render([{input: 'short.mp4', asset: {kind: 'video'}, trimStart: 0.5, trimEnd: 1.5, frames: 90, timing: 'speed', hasAudio: true}, {input: 'blue.png', asset: {kind: 'image'}, frames: 60, timing: 'hold'}], {...DEFAULT_SETTINGS, audio: true});
  const audio = probe('out.mp4').streams.find(s => s.codec_type === 'audio');
  assert.equal(audio.codec_name, 'aac'); assert.ok(Math.abs(Number(audio.duration) - 5) < 0.06);
});
