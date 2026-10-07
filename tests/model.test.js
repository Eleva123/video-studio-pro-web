import test from 'node:test';
import assert from 'node:assert/strict';
import {changeFps, DEFAULT_SETTINGS, distributeFrames, readPresets, resizeClip, secondsToFrames, timecode, validateProject, verifyOutput} from '../src/model.js';
const still = frames => ({frames, asset: {kind: 'image'}});
test('10 segundos a 30 FPS dividem três cenas em exatamente 100 quadros', () => {
  assert.deepEqual(distributeFrames(secondsToFrames(10, 30), 3), [100, 100, 100]);
  assert.deepEqual(distributeFrames(301, 3), [101, 100, 100]);
  assert.throws(() => distributeFrames(2, 3));
});
test('trocar FPS mantém a duração e arredonda para quadros inteiros', () => {
  const result = changeFps({settings: DEFAULT_SETTINGS, clips: [still(300), still(100)]}, 60);
  assert.deepEqual(result.clips.map(c => c.frames), [600, 200]);
  assert.equal(result.settings.fps, 60);
  assert.equal(timecode(54, 30), '00:00:01:24');
});
test('bloqueia dimensão ímpar, duração inválida e corte fora do vídeo', () => {
  const p = {settings: {...DEFAULT_SETTINGS}, clips: [still(300)]};
  assert.equal(validateProject(p), true);
  assert.throws(() => validateProject({...p, settings: {...p.settings, width: 601}}), /número par/);
  assert.throws(() => validateProject({...p, clips: [still(0)]}));
  assert.throws(() => validateProject({...p, clips: [{frames: 300, trimStart: 1, trimEnd: 4, asset: {kind: 'video', duration: 2}}]}), /cortes/);
});
test('resultado de apenas um quadro não pode passar como vídeo de dez segundos', () => {
  const video = {codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p', width: 600, height: 360, avg_frame_rate: '30/1', duration: '10', nb_frames: '300'};
  assert.equal(verifyOutput({streams: [video]}, DEFAULT_SETTINGS, 300), video);
  assert.throws(() => verifyOutput({streams: [{...video, duration: '0.04', nb_frames: '1'}]}, DEFAULT_SETTINGS, 300));
  assert.throws(() => verifyOutput({streams: [{...video, pix_fmt: 'yuv444p'}]}, DEFAULT_SETTINGS, 300));
});
test('presets corrompidos não impedem a abertura do editor', () => {
  assert.deepEqual(readPresets({getItem: () => '{invalid'}), []);
  assert.deepEqual(readPresets({getItem: () => '{"name":"x"}'}), []);
  assert.deepEqual(readPresets({getItem: () => JSON.stringify([{name: 'Meu painel', width: 600, height: 360}, {name: 'Inválido', width: 601, height: 360}])}), [{name: 'Meu painel', width: 600, height: 360}]);
});
test('alças da timeline ajustam duração e corte inicial em quadros', () => {
  const clip = {frames: 100, trimStart: 0, trimEnd: 4, asset: {kind: 'video', duration: 4}};
  assert.deepEqual(resizeClip(clip, 20, 'right', 30), {frames: 120});
  assert.deepEqual(resizeClip(clip, 15, 'left', 30), {frames: 85, trimStart: 0.5});
});
