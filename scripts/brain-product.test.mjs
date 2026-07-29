import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = 'scripts/fixtures/product-brain';

function product(question) {
  const result = spawnSync(process.execPath, ['scripts/brain-product.mjs', '--json', '--root', fixtureRoot, question], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

describe('product decision bundle', () => {
  it('uses the registry and detected product intelligence notes for a product question', () => {
    const result = product('How can we improve D7 retention with a daily goal?');

    assert.equal(result.decisionStatus, 'ready-for-hypothesis-design');
    assert.deepEqual(result.retrieval.intents.map((intent) => intent.id), ['retention']);
    assert.ok(result.readNow.includes('card-game-data/18 - Product - Strategy.md'));
    assert.ok(result.readNow.includes('card-game-data/21 - Product - Evidence Log.md'));
    assert.ok(result.readNow.includes('card-game-data/22 - Product - Opportunity Backlog.md'));
  });

  it('keeps recorded evidence, opportunity records, and proposals separate', () => {
    const result = product('daily collection goal retention');

    assert.equal(result.evidence.status, 'recorded-evidence-found');
    assert.match(result.evidence.items[0].text, /daily collection goal/i);
    assert.equal(result.relatedOpportunities.status, 'records-found-not-recommended');
    assert.match(result.solutionOutline.constraint, /does not invent/i);
  });

  it('reports missing product evidence as an open assumption instead of fabricating it', () => {
    const result = product('Which social feature should we add?');

    assert.equal(result.decisionStatus, 'discovery-required');
    assert.equal(result.evidence.status, 'no-query-specific-evidence-found');
    assert.ok(result.assumptions.some((item) => /No query-specific recorded evidence/.test(item.statement)));
  });

  it('recognises Ukrainian willingness-to-pay requests and applies the monetization guardrail', () => {
    const result = product('Які фічі підвищать D7 retention і за які гравці будуть платити?');

    assert.ok(result.readNow.includes('card-game-data/23 - Product - Monetization Policy.md'));
    assert.ok(result.metricDiscipline.some((rule) => /Real-money monetization is outside/.test(rule)));
  });

  it('fails clearly when no question is provided', () => {
    const result = spawnSync(process.execPath, ['scripts/brain-product.mjs'], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /provide a product question/);
  });
});
