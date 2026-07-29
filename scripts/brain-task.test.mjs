import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = 'scripts/fixtures/product-brain';

function route(task) {
  const result = spawnSync(process.execPath, ['scripts/brain-task.mjs', '--json', '--no-audit', '--root', fixtureRoot, task], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

describe('mandatory task routing', () => {
  it('routes Ukrainian product work through the full Product Intelligence bundle', () => {
    const result = route('Спроєктуй аукціон для дублікатів карток');

    assert.equal(result.workflow, 'product-intelligence-required');
    assert.ok(result.signals.includes('аукціон'));
    assert.ok(result.productBundle.readNow.includes('card-game-data/18 - Product - Strategy.md'));
  });

  it('keeps an isolated technical test repair on the standard compact route', () => {
    const result = route('Fix a unit test for the auth DTO validation error');

    assert.equal(result.workflow, 'standard-context-required');
    assert.deepEqual(result.productBundle, null);
  });

  it('fails clearly when the agent omits the task request', () => {
    const result = spawnSync(process.execPath, ['scripts/brain-task.mjs', '--no-audit'], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /provide the complete task request/);
  });
});
