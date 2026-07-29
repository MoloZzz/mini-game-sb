import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = resolve(root, 'card-game-data/agent-product-index.json');
const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const query = args.filter((arg) => arg !== '--json').join(' ').trim();

function tokenize(value) {
  return value
    .toLocaleLowerCase('uk-UA')
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((token) => token.length > 1) ?? [];
}

function isRelatedToken(queryToken, keywordToken) {
  if (queryToken === keywordToken) return true;
  if (queryToken.startsWith(keywordToken) || keywordToken.startsWith(queryToken)) return true;

  // Ukrainian inflections commonly preserve a long lexical stem while only
  // changing the ending ("аукціон" → "аукціону", "торгівля" → "торгівлі").
  // A four-character common prefix is specific enough for this intentionally
  // small vocabulary and avoids a heavyweight embedding/indexing dependency.
  let commonLength = 0;
  const limit = Math.min(queryToken.length, keywordToken.length);
  while (commonLength < limit && queryToken[commonLength] === keywordToken[commonLength]) {
    commonLength++;
  }
  return commonLength >= 4;
}

function fail(message) {
  console.error(`brain:retrieve: ${message}`);
  process.exitCode = 1;
}

if (!query) {
  fail('provide a product request, for example: npm run brain:retrieve -- "NPC auction for duplicate cards"');
} else if (!existsSync(indexPath)) {
  fail('card-game-data/agent-product-index.json is missing');
} else {
  let index;
  try {
    index = JSON.parse(readFileSync(indexPath, 'utf8'));
  } catch (error) {
    fail(`cannot parse the product index: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (index) {
    const queryTokens = new Set(tokenize(query));
    const matchedBundles = index.bundles
      .map((bundle) => {
        const matchedKeywords = bundle.keywords.filter((keyword) =>
          tokenize(keyword).every((keywordToken) =>
            [...queryTokens].some((queryToken) => isRelatedToken(queryToken, keywordToken)),
          ),
        );
        return { ...bundle, matchedKeywords, score: matchedKeywords.length };
      })
      .filter((bundle) => bundle.score > 0)
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
      .slice(0, 3);

    const readNow = [...index.foundation.primary];
    const references = [];
    for (const bundle of matchedBundles) {
      readNow.push(...bundle.primary);
      references.push(...bundle.references);
    }

    const unique = (paths) => [...new Set(paths)];
    const result = {
      query,
      intents: matchedBundles.map(({ id, matchedKeywords, guidance }) => ({
        id,
        matchedKeywords,
        guidance,
      })),
      readNow: unique(readNow),
      references: unique(references).filter((path) => !readNow.includes(path)),
      noIntentMatched: matchedBundles.length === 0,
    };

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Product retrieval — ${JSON.stringify(query)}`);
      console.log('\nRead now:');
      for (const path of result.readNow) console.log(`- ${path}`);

      if (result.intents.length > 0) {
        console.log('\nMatched intents:');
        for (const intent of result.intents) {
          console.log(`- ${intent.id} (matched: ${intent.matchedKeywords.join(', ')})`);
          console.log(`  ${intent.guidance}`);
        }
      } else {
        console.log('\nNo specialised intent matched. Use the product template to make unknowns explicit before proposing a solution.');
      }

      if (result.references.length > 0) {
        console.log('\nReferences — open only when the proposal needs numbers, detailed mechanics, or prior rationale:');
        for (const path of result.references) console.log(`- ${path}`);
      }

      console.log('\nDelivery rule: distinguish fact, decision, open assumption, and proposal. Use the product solution template before recommending implementation.');
    }
  }
}
