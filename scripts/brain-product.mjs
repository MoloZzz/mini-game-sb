import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCT_NOTE_KINDS = [
  {
    id: 'strategy',
    label: 'Product Strategy',
    patterns: [/product.*strateg/, /strateg.*product/, /product.*vision/, /vision.*product/],
    readForEveryQuestion: true,
  },
  {
    id: 'jobs-to-be-done',
    label: 'Jobs to Be Done',
    patterns: [/jobs?.*to.*be.*done/, /\bjtbd\b/],
    readForEveryQuestion: true,
  },
  {
    id: 'metric-tree',
    label: 'Metric Tree',
    patterns: [/metric.*tree/, /metrics?.*(framework|model)/],
    readForEveryQuestion: true,
  },
  {
    id: 'evidence-log',
    label: 'Evidence Log',
    patterns: [/evidence.*log/, /(research|insight|feedback).*log/],
    readForEveryQuestion: true,
  },
  {
    id: 'opportunity-backlog',
    label: 'Opportunity Backlog',
    patterns: [/opportunit.*backlog/, /product.*backlog/, /opportunit.*map/],
    readForEveryQuestion: false,
  },
  {
    id: 'monetization-policy',
    label: 'Monetization Policy',
    patterns: [/(monetiz|revenue|payment|pricing).*policy/, /policy.*(monetiz|revenue|payment|pricing)/],
    readForEveryQuestion: false,
  },
];
const MONETIZATION_TERMS = [
  'monetization',
  'revenue',
  'payment',
  'pay',
  'price',
  'pricing',
  'purchase',
  'paid',
  'монетизація',
  'платити',
  'платний',
  'оплата',
  'дохід',
  'ціна',
  'купівля',
  'покупка',
  'гроші',
];

function tokenize(value) {
  return value
    .toLocaleLowerCase('uk-UA')
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((token) => token.length > 1) ?? [];
}

function isRelatedToken(queryToken, keywordToken) {
  if (queryToken === keywordToken) return true;
  if (queryToken.length < 3 || keywordToken.length < 3) return false;
  if (queryToken.startsWith(keywordToken) || keywordToken.startsWith(queryToken)) return true;

  let commonLength = 0;
  const limit = Math.min(queryToken.length, keywordToken.length);
  while (commonLength < limit && queryToken[commonLength] === keywordToken[commonLength]) {
    commonLength++;
  }
  return commonLength >= 4;
}

function unique(values) {
  return [...new Set(values)];
}

function compactText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function parseArgs(args) {
  let json = false;
  let root = scriptRoot;
  const queryParts = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--json') {
      json = true;
    } else if (arg === '--root') {
      const value = args[index + 1];
      if (!value) throw new Error('--root requires a directory');
      root = isAbsolute(value) ? resolve(value) : resolve(process.cwd(), value);
      index++;
    } else {
      queryParts.push(arg);
    }
  }

  return { json, root, query: queryParts.join(' ').trim() };
}

function loadIndex(root) {
  const indexPath = resolve(root, 'card-game-data/agent-product-index.json');
  if (!existsSync(indexPath)) {
    throw new Error('card-game-data/agent-product-index.json is missing');
  }

  try {
    return JSON.parse(readFileSync(indexPath, 'utf8'));
  } catch (error) {
    throw new Error(`cannot parse the product index: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function retrieve(index, query) {
  const queryTokens = new Set(tokenize(query));
  const matchedBundles = (index.bundles ?? [])
    .map((bundle) => {
      const matchedKeywords = (bundle.keywords ?? []).filter((keyword) =>
        tokenize(keyword).every((keywordToken) =>
          [...queryTokens].some((queryToken) => isRelatedToken(queryToken, keywordToken)),
        ),
      );
      return { ...bundle, matchedKeywords, score: matchedKeywords.length };
    })
    .filter((bundle) => bundle.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, 3);

  const readNow = [...(index.foundation?.primary ?? [])];
  const references = [];
  for (const bundle of matchedBundles) {
    readNow.push(...(bundle.primary ?? []));
    references.push(...(bundle.references ?? []));
  }

  const canonicalReadNow = unique(readNow);
  return {
    intents: matchedBundles.map(({ id, matchedKeywords, guidance }) => ({ id, matchedKeywords, guidance })),
    readNow: canonicalReadNow,
    references: unique(references).filter((path) => !canonicalReadNow.includes(path)),
    noIntentMatched: matchedBundles.length === 0,
  };
}

function detectProductNotes(root) {
  const vaultDirectory = resolve(root, 'card-game-data');
  if (!existsSync(vaultDirectory)) return [];

  return readdirSync(vaultDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .flatMap((entry) => {
      const path = `card-game-data/${entry.name}`;
      const content = readFileSync(resolve(vaultDirectory, entry.name), 'utf8');
      // Product notes frequently link to every other Product Intelligence
      // artifact. Categorising from their body therefore turns a reference
      // into a false role match. The filename is the stable, canonical key.
      const searchable = entry.name.toLocaleLowerCase('uk-UA');
      return PRODUCT_NOTE_KINDS.filter((candidate) =>
        candidate.patterns.some((pattern) => pattern.test(searchable)),
      ).map((kind) => ({ ...kind, path, content }));
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function relevanceScore(text, queryTokens) {
  const tokens = tokenize(text);
  return [...queryTokens].reduce(
    (score, queryToken) => score + (tokens.some((token) => isRelatedToken(queryToken, token)) ? 1 : 0),
    0,
  );
}

function extractRecordLines(content) {
  const lines = content.split(/\r?\n/);
  const records = [];
  let heading = '';
  let inTable = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      heading = headingMatch[1];
      inTable = false;
      continue;
    }

    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((cell) => compactText(cell));
      if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
      if (!inTable) {
        inTable = true;
        continue;
      }
      records.push({ heading, text: compactText(cells.join(' — ')) });
      continue;
    }

    inTable = false;
    const listMatch = line.match(/^[-*+]\s+(.+)$/);
    if (listMatch) records.push({ heading, text: compactText(listMatch[1]) });
  }

  return records.filter((record) => record.text.length > 0);
}

function selectRelevantRecords(note, queryTokens, limit = 4) {
  const records = extractRecordLines(note.content)
    .map((record) => ({ ...record, score: relevanceScore(`${record.heading} ${record.text}`, queryTokens) }))
    .filter((record) => record.score > 0 && !/<[^>]+>|\bTBD\b|YYYY-MM-DD/i.test(`${record.heading} ${record.text}`))
    .sort((left, right) => right.score - left.score || left.text.localeCompare(right.text))
    .slice(0, limit)
    .map(({ heading, text }) => ({ source: note.path, heading, text }));
  return records;
}

function isMonetizationQuestion(queryTokens) {
  return MONETIZATION_TERMS.some((term) =>
    [...queryTokens].some((queryToken) => isRelatedToken(queryToken, term)),
  );
}

function createReadingPlan(retrieval, notes, queryTokens) {
  const plan = retrieval.readNow.map((path) => ({
    path,
    reason: 'Canonical product context selected by the intent registry.',
    required: true,
  }));

  for (const note of notes) {
    const hasRelevantRecord = selectRelevantRecords(note, queryTokens, 1).length > 0;
    const shouldRead = note.readForEveryQuestion || hasRelevantRecord || (note.id === 'monetization-policy' && isMonetizationQuestion(queryTokens));
    if (shouldRead) {
      plan.push({
        path: note.path,
        reason: note.readForEveryQuestion
          ? `${note.label} is required to ground a product decision.`
          : `${note.label} contains query-relevant material.`,
        required: true,
      });
    }
  }

  return unique(plan.map((item) => item.path)).map((path) => plan.find((item) => item.path === path));
}

function describeMissingFoundation(notes, evidence) {
  const ids = new Set(notes.map((note) => note.id));
  const gaps = [];
  if (!ids.has('strategy')) gaps.push('No Product Strategy note was detected; product objective and target audience are not established here.');
  if (!ids.has('jobs-to-be-done')) gaps.push('No Jobs to Be Done note was detected; the player problem must be stated before choosing a feature.');
  if (!ids.has('metric-tree')) gaps.push('No Metric Tree note was detected; the success metric and guardrail metric must be chosen explicitly.');
  if (!ids.has('evidence-log')) gaps.push('No Evidence Log note was detected; treat expected player impact as an unvalidated hypothesis.');
  if (evidence.items.length === 0 && ids.has('evidence-log')) {
    gaps.push('No query-specific recorded evidence was found in the Evidence Log. Do not claim demand or expected impact.');
  }
  if (evidence.incompleteRecords.length > 0) {
    gaps.push('A query-relevant Evidence Log record is missing a verifiable date; treat it as an open assumption until the record is completed.');
  }
  return gaps;
}

function metricDiscipline(queryTokens) {
  const rules = [];
  const includes = (terms) => terms.some((term) => [...queryTokens].some((token) => isRelatedToken(token, term)));
  if (includes(['retention', 'd1', 'd7', 'return'])) {
    rules.push('Retention requires a cohort, interval, and return event; an active-session action is not retention evidence by itself.');
  }
  if (includes(['engagement', 'session', 'active'])) {
    rules.push('Engagement measures quality or depth of an active session; do not present it as retention without a defined return interval.');
  }
  if (includes(MONETIZATION_TERMS)) {
    rules.push('Real-money monetization is outside the current scope. Frame it only as future research pending an explicit scope decision and policy review.');
  }
  return rules;
}

function createBundle(root, query) {
  const index = loadIndex(root);
  const retrieval = retrieve(index, query);
  const queryTokens = new Set(tokenize(query));
  const notes = detectProductNotes(root);
  const readingPlan = createReadingPlan(retrieval, notes, queryTokens);
  const evidenceNote = notes.find((note) => note.id === 'evidence-log');
  const metricNote = notes.find((note) => note.id === 'metric-tree');
  const opportunityNote = notes.find((note) => note.id === 'opportunity-backlog');
  const evidenceRecords = (evidenceNote ? selectRelevantRecords(evidenceNote, queryTokens) : [])
    .filter((record) => /^E-\d{4}-\d{2}-\d{2}-\d+\b/i.test(record.heading) || /\b20\d{2}-\d{2}-\d{2}\b/.test(record.text))
    .map((record) => ({
      ...record,
      evidenceQuality: /\b20\d{2}-\d{2}-\d{2}\b/.test(record.text) ? 'dated-record' : 'source-or-date-needs-verification',
    }));
  const evidenceItems = evidenceRecords.filter((item) => item.evidenceQuality === 'dated-record');
  const incompleteEvidenceRecords = evidenceRecords.filter((item) => item.evidenceQuality !== 'dated-record');
  const metricCandidates = metricNote ? selectRelevantRecords(metricNote, queryTokens) : [];
  const relatedOpportunities = opportunityNote ? selectRelevantRecords(opportunityNote, queryTokens) : [];
  const evidence = {
    status: evidenceItems.length > 0 ? 'recorded-evidence-found' : 'no-query-specific-evidence-found',
    items: evidenceItems,
    incompleteRecords: incompleteEvidenceRecords,
    sourceNote: evidenceNote?.path ?? null,
  };
  const gaps = describeMissingFoundation(notes, evidence);

  return {
    version: 1,
    query,
    decisionStatus: evidenceItems.length > 0 && metricCandidates.length > 0 ? 'ready-for-hypothesis-design' : 'discovery-required',
    retrieval: {
      ...retrieval,
      productIntelligenceNotes: notes.map(({ id, label, path }) => ({ id, label, path })),
    },
    readNow: readingPlan.map((item) => item.path),
    readingPlan,
    evidence,
    metricCandidates,
    relatedOpportunities: {
      status: relatedOpportunities.length > 0 ? 'records-found-not-recommended' : 'no-query-specific-record-found',
      items: relatedOpportunities,
      sourceNote: opportunityNote?.path ?? null,
    },
    assumptions: gaps.map((gap) => ({ status: 'open-assumption', statement: gap })),
    inputClassification: {
      facts: {
        status: 'not-extracted-by-cli',
        sourceNotes: retrieval.readNow,
        rule: 'Read the canonical notes and cite the exact claim before calling it a fact.',
      },
      decisions: {
        status: 'not-extracted-by-cli',
        sourceNotes: retrieval.readNow,
        rule: 'Only owner-approved constraints are decisions; retrieval guidance is not itself an approval.',
      },
      evidence: evidenceItems,
      assumptions: gaps.map((gap) => ({ status: 'open-assumption', statement: gap })),
      proposals: relatedOpportunities.map((item) => ({ ...item, status: 'unvalidated-opportunity-not-a-recommendation' })),
    },
    retrievalGuidance: retrieval.intents.map(({ id, guidance }) => ({ intent: id, guidance })),
    metricDiscipline: metricDiscipline(queryTokens),
    solutionOutline: {
      status: 'hypothesis-template-not-a-product-decision',
      requiredSections: [
        'Player problem and target segment, supported by a cited evidence item or explicitly marked as an assumption.',
        'At least two options that preserve the active product guardrails and return the player to the core loop.',
        'Comparable reach × impact × confidence / effort scores (1–5), with the confidence basis and no invented baselines or surveys.',
        'A smallest MVP flow with state rules, scope exclusions, and an owner decision before implementation.',
        'A decision rule that says what result scales, revises, or stops the hypothesis.',
      ],
      constraint: 'This tool does not invent a feature recommendation when the vault has no supporting evidence.',
    },
    experimentRequirements: {
      status: 'required-before-impact-claim',
      mustDefine: [
        'Target player segment and the behavior or problem being tested.',
        'One primary success metric and at least one guardrail metric; use recorded Metric Tree entries when available.',
        'Baseline, observation window, and a method for collecting comparable evidence.',
        'Smallest exposure scope, qualitative feedback prompt, and stop/scale decision threshold.',
      ],
      availableMetricCandidates: metricCandidates,
      note: 'Metrics absent from the vault are intentionally left unspecified rather than guessed.',
    },
    memoryFollowUp: {
      approvedDecision: 'Record a durable decision in the vault only after the product owner approves it.',
      unresolvedQuestion: 'Record unanswered assumptions or research needs as open questions, not as canon.',
    },
  };
}

function renderHuman(bundle) {
  const lines = [
    `Product decision bundle — ${JSON.stringify(bundle.query)}`,
    `Status: ${bundle.decisionStatus}`,
    '',
    'Read now:',
    ...bundle.readingPlan.map((item) => `- ${item.path} — ${item.reason}`),
    '',
    'Evidence:',
  ];

  if (bundle.evidence.items.length === 0) {
    lines.push('- No query-specific recorded evidence found. Treat the request as a hypothesis.');
  } else {
    for (const item of bundle.evidence.items) lines.push(`- ${item.text} (${item.source})`);
  }

  lines.push('', 'Open assumptions:');
  if (bundle.assumptions.length === 0) {
    lines.push('- No structural retrieval gap was detected; still validate causal impact with an experiment.');
  } else {
    for (const item of bundle.assumptions) lines.push(`- ${item.statement}`);
  }

  lines.push('', 'Solution outline required:');
  for (const section of bundle.solutionOutline.requiredSections) lines.push(`- ${section}`);
  lines.push('', 'Experiment requirements:');
  for (const requirement of bundle.experimentRequirements.mustDefine) lines.push(`- ${requirement}`);
  lines.push('', 'Delivery rule: cite evidence separately from assumptions and proposals; a backlog record is not a recommendation or approved decision.');
  return lines.join('\n');
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
    if (!options.query) {
      throw new Error('provide a product question, for example: npm run brain:product -- "How could we improve D7 retention?"');
    }
    const bundle = createBundle(options.root, options.query);
    console.log(options.json ? JSON.stringify(bundle, null, 2) : renderHuman(bundle));
  } catch (error) {
    console.error(`brain:product: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export { createBundle, detectProductNotes, retrieve };
