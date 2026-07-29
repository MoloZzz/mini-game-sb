import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBundle } from './brain-product.mjs';

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const auditDirectory = '.brain/audit';
const activeReceiptPath = `${auditDirectory}/active-task-route.json`;
const auditLogPath = `${auditDirectory}/task-routes.jsonl`;
const PRODUCT_SIGNAL_TERMS = [
  'product', 'feature', 'retention', 'engagement', 'monetization', 'revenue', 'pricing', 'payment',
  'willingness', 'economy', 'auction', 'shop', 'store', 'marketplace', 'progression', 'lore',
  'story', 'narrative', 'reward', 'crafting', 'set', 'quest',
  'продукт', 'фіча', 'ретеншн', 'утримання', 'залучення', 'монетизац', 'дохід', 'плат', 'ціна',
  'економ', 'аукціон', 'магазин', 'крамниц', 'ринок', 'прогрес', 'лор', 'сюжет', 'наратив',
  'нагород', 'крафт', 'сет', 'квест',
];

function tokenize(value) {
  return value
    .toLocaleLowerCase('uk-UA')
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((token) => token.length > 1) ?? [];
}

function matchesSignal(token, signal) {
  return token === signal || (signal.length >= 4 && token.startsWith(signal));
}

function parseArgs(args) {
  let json = false;
  let root = scriptRoot;
  let recordAudit = true;
  let usage = false;
  const queryParts = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--json') json = true;
    else if (arg === '--no-audit') recordAudit = false;
    else if (arg === '--usage') usage = true;
    else if (arg === '--root') {
      const value = args[index + 1];
      if (!value) throw new Error('--root requires a directory');
      root = isAbsolute(value) ? resolve(value) : resolve(process.cwd(), value);
      index++;
    } else {
      queryParts.push(arg);
    }
  }

  return { json, root, recordAudit, usage, query: queryParts.join(' ').trim() };
}

function classify(query) {
  const tokens = tokenize(query);
  const signals = [...new Set(PRODUCT_SIGNAL_TERMS.filter((signal) =>
    tokens.some((token) => matchesSignal(token, signal)),
  ))];
  return {
    workflow: signals.length > 0 ? 'product-intelligence-required' : 'standard-context-required',
    signals,
  };
}

function createReceipt(root, query, route) {
  return {
    version: 1,
    at: new Date().toISOString(),
    querySha256: createHash('sha256').update(query).digest('hex'),
    workflow: route.workflow,
    signals: route.signals,
    selectedPaths: route.productBundle?.readNow ?? ['docs/agent/00-brief.md'],
  };
}

function writeReceipt(root, receipt) {
  const directory = resolve(root, auditDirectory);
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(root, activeReceiptPath), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  appendFileSync(resolve(root, auditLogPath), `${JSON.stringify(receipt)}\n`, 'utf8');
}

function readUsage(root) {
  const path = resolve(root, auditLogPath);
  if (!existsSync(path)) {
    return { entries: [], message: 'No local task-route receipts have been recorded yet.' };
  }

  const entries = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    })
    .slice(-20)
    .reverse();
  return { entries, message: null };
}

function routeTask(root, query) {
  const classification = classify(query);
  const productBundle = classification.workflow === 'product-intelligence-required'
    ? createBundle(root, query)
    : null;
  return { version: 1, query, ...classification, productBundle };
}

function renderRoute(route, receipt) {
  const lines = [
    `Task route — ${JSON.stringify(route.query)}`,
    `Workflow: ${route.workflow}`,
    `Signals: ${route.signals.length > 0 ? route.signals.join(', ') : 'none'}`,
  ];
  if (route.productBundle) {
    lines.push('', 'Read now:', ...route.productBundle.readNow.map((path) => `- ${path}`));
    lines.push('', `Decision status: ${route.productBundle.decisionStatus}`);
    lines.push('Requirement: read the files above and docs/agent/07-product-intelligence.md before planning or editing.');
  } else {
    lines.push('Requirement: read AGENTS.md, docs/agent/00-brief.md, then the task-specific pack before work.');
  }
  if (receipt) lines.push('', `Audit receipt: ${receipt.querySha256.slice(0, 12)} (${activeReceiptPath})`);
  return lines.join('\n');
}

function renderUsage(usage) {
  if (usage.message) return usage.message;
  return [
    'Recent local task-route receipts (request text is intentionally not stored):',
    ...usage.entries.map((entry) =>
      `- ${entry.at} | ${entry.workflow} | signals: ${entry.signals.join(', ') || 'none'} | receipt: ${entry.querySha256.slice(0, 12)}`,
    ),
  ].join('\n');
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.usage) {
      const usage = readUsage(options.root);
      console.log(options.json ? JSON.stringify(usage, null, 2) : renderUsage(usage));
      return;
    }
    if (!options.query) {
      throw new Error('provide the complete task request, for example: npm run brain:task -- "Design an NPC auction for duplicate cards"');
    }

    const route = routeTask(options.root, options.query);
    const receipt = options.recordAudit ? createReceipt(options.root, options.query, route) : null;
    if (receipt) writeReceipt(options.root, receipt);
    console.log(options.json ? JSON.stringify({ ...route, receipt }, null, 2) : renderRoute(route, receipt));
  } catch (error) {
    console.error(`brain:task: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export { classify, routeTask };
