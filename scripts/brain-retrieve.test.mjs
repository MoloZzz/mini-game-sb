import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function retrieve(query) {
  const result = spawnSync(process.execPath, ['scripts/brain-retrieve.mjs', '--json', query], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

describe('product retrieval', () => {
  it('retrieves economy and marketplace constraints for a shop auction', () => {
    const result = retrieve('NPC auction and shop economy');
    assert.deepEqual(
      result.intents.map((intent) => intent.id),
      ['marketplace', 'economy'],
    );
    assert.ok(result.readNow.includes('card-game-data/15 - Product - Economy Context.md'));
  });

  it('matches Ukrainian inflections for marketplace work', () => {
    const result = retrieve('система торгівлі картками');
    assert.ok(result.intents.some((intent) => intent.id === 'marketplace'));
  });

  it('keeps unapproved lore separate from established canon', () => {
    const result = retrieve('лор і сюжет нового сету');
    assert.ok(result.intents.some((intent) => intent.id === 'lore'));
    assert.ok(result.readNow.includes('card-game-data/16 - Product - Narrative Bible.md'));
  });

  it('flags combat as a scope expansion', () => {
    const result = retrieve('бойова прогресія');
    assert.ok(result.intents.some((intent) => intent.id === 'combat'));
  });
});
