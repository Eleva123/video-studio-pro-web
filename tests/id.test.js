import test from 'node:test';
import assert from 'node:assert/strict';
import {createId} from '../src/id.js';

test('usa randomUUID quando o navegador oferece a API', () => {
  assert.equal(createId({randomUUID: () => 'uuid-do-teste'}), 'uuid-do-teste');
});

test('usa getRandomValues quando randomUUID não existe', () => {
  assert.match(createId({getRandomValues: bytes => bytes.fill(0)}), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test('mantém um identificador quando nenhuma API crypto está disponível', () => {
  assert.match(createId({}), /^id-/);
});
