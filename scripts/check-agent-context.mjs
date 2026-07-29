import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packs = new Map([
  ['AGENTS.md', 350],
  ['docs/agent/00-brief.md', 420],
  ['docs/agent/01-backend-contracts.md', 620],
  ['docs/agent/02-economy-invariants.md', 520],
  ['docs/agent/03-ui-and-tests.md', 480],
  ['docs/agent/04-card-forge.md', 380],
  ['docs/agent/05-change-playbook.md', 480],
  ['docs/agent/06-generated-surface.md', 620],
]);
const instructionShims = [
  'CLAUDE.md',
  '.cursor/rules/required-project-context.mdc',
  '.github/copilot-instructions.md',
];
const pathPattern = /`((?:game-api|game-ui|packages|card-forge|docs|scripts)\/[\w./-]+)`/g;
const errors = [];
const writeGenerated = process.argv.includes('--write-generated');
const showImpact = process.argv.includes('--impact');

function walkFiles(relativeDirectory) {
  const absoluteDirectory = resolve(root, relativeDirectory);
  if (!existsSync(absoluteDirectory)) return [];

  return readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const childRelativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) return walkFiles(childRelativePath);
    return entry.isFile() ? [childRelativePath.replaceAll('\\', '/')] : [];
  });
}

function extractControllerRoutes(relativePath) {
  const content = readFileSync(resolve(root, relativePath), 'utf8');
  const controllerMatch = content.match(/@Controller\('([^']+)'\)/);
  if (!controllerMatch) return [];

  const basePath = controllerMatch[1];
  const decoratorPattern =
    /@(Get|Post|Patch|Delete)\((?:'([^']*)')?\)[\s\S]{0,320}?\r?\n\s*(?:async\s+)?(\w+)\s*\(/g;
  return Array.from(content.matchAll(decoratorPattern), (match) => {
    const [, method, segment, handler] = match;
    const suffix = segment ? `/${segment}` : '';
    return `| ${method.toUpperCase()} | \`/api/${basePath}${suffix}\` | \`${relativePath}\` → \`${handler}\` |`;
  });
}

function extractEntities() {
  return walkFiles('game-api/src/entities')
    .filter((path) => path.endsWith('.entity.ts'))
    .map((relativePath) => {
      const content = readFileSync(resolve(root, relativePath), 'utf8');
      const table = content.match(/@Entity\('([^']+)'\)/)?.[1] ?? 'unknown';
      const className = content.match(/export class (\w+)/)?.[1] ?? 'unknown';
      return `| \`${table}\` | \`${className}\` | \`${relativePath}\` |`;
    })
    .sort();
}

function generateSurface() {
  const controllers = walkFiles('game-api/src')
    .filter((path) => path.endsWith('.controller.ts'))
    .sort()
    .flatMap(extractControllerRoutes)
    .sort();
  const entities = extractEntities();
  const migrations = walkFiles('game-api/src/migrations').filter((path) => path.endsWith('.ts')).sort();
  const exports = Array.from(
    readFileSync(resolve(root, 'packages/shared-types/src/index.ts'), 'utf8').matchAll(
      /export \* from '([^']+)'/g,
    ),
    (match) => `\`packages/shared-types/src/${match[1].replace('./', '').replace('.js', '.ts')}\``,
  );
  const features = readdirSync(resolve(root, 'game-ui/src/features'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `\`game-ui/src/features/${entry.name}/\``)
    .sort();

  return `# Generated project surface\n\n> Generated from the source tree by \`npm run sync:brain\`. Do not edit manually; run that command after structural changes.\n\n## API routes\n\n| Method | Route | Source |\n| --- | --- | --- |\n${controllers.join('\n')}\n\n## Database entities\n\n| Table | Entity | Source |\n| --- | --- | --- |\n${entities.join('\n')}\n\n## Registered migration source files\n\n${migrations.map((path) => `- \`${path}\``).join('\n')}\n\n## Shared-type source modules\n\n${exports.map((path) => `- ${path}`).join('\n')}\n\n## UI feature roots\n\n${features.map((path) => `- ${path}`).join('\n')}\n`;
}

function changedFiles() {
  try {
    const safeDirectory = root.replaceAll('\\', '/');
    const gitArgs = ['-c', `safe.directory=${safeDirectory}`];
    const changed = execFileSync('git', [...gitArgs, 'diff', '--name-only', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split(/\r?\n/)
      .filter(Boolean);
    const untracked = execFileSync('git', [...gitArgs, 'ls-files', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split(/\r?\n/)
      .filter(Boolean);
    return [...new Set([...changed, ...untracked])];
  } catch {
    return [];
  }
}

function packsForPath(path) {
  if (/^(game-api\/src\/(drops|inventory|ledger|milestones|collection|players)\/|packages\/shared-types\/src\/(rarity|case|player|milestones|reel)\.ts)/.test(path)) {
    return ['01-backend-contracts.md', '02-economy-invariants.md'];
  }
  if (/^(game-api\/|packages\/shared-types\/)/.test(path)) return ['01-backend-contracts.md'];
  if (/^game-ui\/src\//.test(path)) return ['03-ui-and-tests.md'];
  if (/^card-forge\//.test(path)) return ['04-card-forge.md'];
  if (/^(package\.json|docker-compose\.yml|\.env\.example)$/.test(path)) return ['00-brief.md', '05-change-playbook.md'];
  return [];
}

const generatedPath = 'docs/agent/06-generated-surface.md';
const generatedContent = generateSurface();
if (writeGenerated) {
  writeFileSync(resolve(root, generatedPath), generatedContent, 'utf8');
  console.log(`Updated ${generatedPath}.`);
} else if (!existsSync(resolve(root, generatedPath))) {
  errors.push(`${generatedPath}: missing; run npm run sync:brain`);
} else if (readFileSync(resolve(root, generatedPath), 'utf8') !== generatedContent) {
  errors.push(`${generatedPath}: stale; run npm run sync:brain`);
}

for (const [relativePath, maximumWords] of packs) {
  const absolutePath = resolve(root, relativePath);
  if (!existsSync(absolutePath)) {
    errors.push(`${relativePath}: missing`);
    continue;
  }

  const content = readFileSync(absolutePath, 'utf8');
  const words = content.match(/[\p{L}\p{N}_-]+/gu)?.length ?? 0;
  if (words > maximumWords) {
    errors.push(`${relativePath}: ${words} words exceeds budget of ${maximumWords}`);
  }

  for (const match of content.matchAll(pathPattern)) {
    const referencedPath = match[1];
    if (!existsSync(resolve(root, referencedPath))) {
      errors.push(`${relativePath}: referenced path does not exist: ${referencedPath}`);
    }
  }
}

const agents = existsSync(resolve(root, 'AGENTS.md'))
  ? readFileSync(resolve(root, 'AGENTS.md'), 'utf8')
  : '';
if (!agents.includes('docs/agent/00-brief.md')) {
  errors.push('AGENTS.md: must route every agent through docs/agent/00-brief.md');
}
if (!agents.includes('Brain trace')) {
  errors.push('AGENTS.md: must require the Brain trace audit receipt');
}

for (const relativePath of instructionShims) {
  const absolutePath = resolve(root, relativePath);
  if (!existsSync(absolutePath)) {
    errors.push(`${relativePath}: missing required agent-instruction shim`);
    continue;
  }
  if (!readFileSync(absolutePath, 'utf8').includes('AGENTS.md')) {
    errors.push(`${relativePath}: must route agents through AGENTS.md`);
  }
  if (!readFileSync(absolutePath, 'utf8').includes('Brain trace')) {
    errors.push(`${relativePath}: must require the Brain trace audit receipt`);
  }
}

if (errors.length > 0) {
  console.error('Agent context check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Agent context check passed (${packs.size} compact packs and ${instructionShims.length} instruction shims).`,
  );
}

if (showImpact) {
  const changed = changedFiles();
  const impacted = new Map();
  for (const path of changed) {
    for (const pack of packsForPath(path)) {
      const matchingPaths = impacted.get(pack) ?? [];
      matchingPaths.push(path);
      impacted.set(pack, matchingPaths);
    }
  }

  if (impacted.size === 0) {
    console.log('Knowledge impact: no source files in the current diff map to a context pack.');
  } else {
    console.log('Knowledge impact — inspect these packs before completing the change:');
    for (const [pack, paths] of impacted) {
      console.log(`- docs/agent/${pack}: ${paths.join(', ')}`);
    }
  }
}
