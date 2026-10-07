import test from 'node:test';
import assert from 'node:assert/strict';
import {frameTarget} from '../src/frameExport.js';
import {DEFAULT_SETTINGS} from '../src/model.js';

const image = frames => ({id: 'image', frames, trimStart: 0, trimEnd: 0, timing: 'hold', asset: {kind: 'image', url: 'blob:image'}});
const video = (frames, duration, timing = 'hold') => ({id: 'video', frames, trimStart: 0, trimEnd: duration, timing, asset: {kind: 'video', url: 'blob:video', duration}});

test('localiza o quadro atual na cena correta', () => {
  const project = {settings: DEFAULT_SETTINGS, clips: [image(100), image(200)]};
  assert.equal(frameTarget(project, 100).clip.id, 'image');
  assert.equal(frameTarget(project, 100).localFrame, 0);
  assert.equal(frameTarget(project, 299).localFrame, 199);
});

test('segura o último quadro de vídeo curto ao salvar o frame', () => {
  const project = {settings: DEFAULT_SETTINGS, clips: [video(300, 2)]};
  assert.equal(frameTarget(project, 299).sourceTime, 59 / 30);
});

test('mapeia velocidade ajustada para o tempo original', () => {
  const project = {settings: DEFAULT_SETTINGS, clips: [video(300, 2, 'speed')]};
  assert.equal(frameTarget(project, 150).sourceTime, 1);
});
