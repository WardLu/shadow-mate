import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as promotion from '../../scripts/release/promote-to-production.mjs';
const { parseArgs, verifyPreflight, runPromote, checkMainCiStatus, getOrCreatePromotionPr, verifyPromotionTree } = promotion;

const HEAD = '1'.repeat(40), PROD = '2'.repeat(40), MERGE = '3'.repeat(40);
const success = { status: 'completed', conclusion: 'success', headSha: HEAD, headBranch: 'main', event: 'push', databaseId: 123 };
const openPr = { number: 450, headRefOid: HEAD, headRefName: 'main', baseRefName: 'production',
  isCrossRepository: false, isDraft: false, state: 'OPEN', mergeCommit: null };
const workflow = "CI", gate = "verify", enforcement = "Enforce selected CI scope";
const passChecks = [{ name: "verify", workflow: "CI", event: 'push', bucket: 'pass', state: 'SUCCESS', link: 'https://github.com/WardLu/shadow-mate/actions/runs/123/job/456' }];

function fixture(options = {}) {
  const calls = []; let merged = false; let preflights = 0; let ciReads = 0; let prReads = 0;
  const tree = '5'.repeat(40);
  const git = args => {
    calls.push(['git', ...args]);
    if (args[0] === 'status') { preflights++; return options.dirty ?? ''; }
    if (args[0] === 'symbolic-ref') return options.branch ?? 'main';
    if (args[0] === 'remote') return options.origin ?? 'https://github.com/WardLu/shadow-mate.git';
    if (args[0] === 'fetch') { if (options.fetchError) throw Error('fetch unavailable'); return ''; }
    if (args[0] === 'ls-remote') { if (options.productionQueryError) { const error = Error('query unavailable'); error.status = 128; throw error; } if (options.noProduction) { const error = Error('no matching ref'); error.status = 2; throw error; } return `${merged ? (options.remoteMergedSha ?? MERGE) : (options.prod ?? PROD)}\trefs/heads/production`; }
    if (args[0] === 'merge-tree') { if (options.mergeConflict) throw Error('merge conflict'); return options.candidateMismatch ? '6'.repeat(40) : tree; }
    if (args[0] === 'merge-base') { if (options.notAncestor) throw Error('not ancestor'); return ''; }
    if (args[0] === 'rev-parse') {
      if (args[1].endsWith('^{tree}')) return options.treeMismatch && args[1].startsWith(MERGE) ? 'different' : tree;
      if (args[1] === 'origin/production') return merged ? (options.remoteMergedSha ?? MERGE) : (options.prod ?? PROD);
      if (args[1] === 'origin/main') return options.remoteMain ?? HEAD;
      if (args[1] === 'HEAD') return preflights > 1 && options.movedHead ? '4'.repeat(40) : HEAD;
    }
    throw Error('Unexpected git call: ' + args);
  };
  const gh = args => {
    calls.push(['gh', ...args]);
    if (args[0] === 'run' && args[1] === 'view') {
      if (options.proofError) throw Error('proof unavailable');
      return JSON.stringify({ ...success, workflowName: workflow, jobs: [{ name: gate, status: 'completed', conclusion: 'success',
        steps: [{ name: enforcement, status: 'completed', conclusion: 'success' }] }],
        ...(args[2] === '456' ? { databaseId: 456, event: 'pull_request' } : {}), ...options.proof });
    }
    if (args[0] === 'run') {
      ciReads++;
      if (options.ciError) throw Error('network/auth unavailable');
      return options.ciRaw ?? JSON.stringify(ciReads > 1 && options.ciAfterWait ? options.ciAfterWait : (options.ci ?? [success]));
    }
    if (args[1] === 'list') return JSON.stringify(options.prs ?? [{ number: 450, url: 'https://example.invalid/pr/450' }]);
    if (args[1] === 'view') {
      prReads++;
      if (merged) return JSON.stringify({ ...openPr, state: options.queued ? 'OPEN' : 'MERGED', mergeCommit: { oid: MERGE } });
      return JSON.stringify({ ...openPr, ...(prReads > 1 ? options.prAfterWait : options.pr) });
    }
    if (args[1] === 'checks') {
      if (options.checksError) throw Error('PR checks failed');
      return args.includes('--json') ? JSON.stringify(options.checks ?? passChecks) : '';
    }
    if (args[1] === 'merge') { merged = true; return ''; }
    if (args[1] === 'create') return 'https://example.invalid/pr/450';
    throw Error('Unexpected gh call: ' + args);
  };
  return { git, gh, calls };
}
const writes = calls => calls.filter(c => c[0] === 'gh' && c[1] === 'pr' && ['create', 'merge'].includes(c[2]));
const merges = calls => calls.filter(c => c[0] === 'gh' && c[2] === 'merge');

test('parseArgs permits dry-run/help and rejects the removed bypass', () => {
  assert.deepEqual(parseArgs(['node', 'script', '--dry-run']), { dryRun: true, deploy: false, help: false });
  assert.equal(parseArgs(['node', 'script', '--help']).help, true);
  assert.throws(() => parseArgs(['node', 'script', '--skip-ci-wait']), /未知参数/);
});
for (const [name, options, error] of [
  ['dirty worktree', { dirty: ' M package.json' }, /工作区不干净/],
  ['non-main branch', { branch: 'feature/test' }, /必须在 'main'/],
  ['unpushed or outdated main', { remoteMain: '4'.repeat(40) }, /不一致/],
]) {
  test('preflight rejects ' + name, () => {
    const f = fixture(options); assert.throws(() => verifyPreflight(f), error); assert.equal(writes(f.calls).length, 0);
  });
}
test('preflight binds exact main and production identities', () => {
  assert.deepEqual(verifyPreflight(fixture()), { headSha: HEAD, originProdSha: PROD });
});
for (const [name, options] of [
  ['missing run', { ci: [] }], ['failure', { ci: [{ ...success, conclusion: 'failure' }] }],
  ['cancelled', { ci: [{ ...success, conclusion: 'cancelled' }] }],
  ['pending', { ci: [{ ...success, status: 'in_progress', conclusion: null }] }],
  ['wrong SHA', { ci: [{ ...success, headSha: PROD }] }],
  ['wrong branch', { ci: [{ ...success, headBranch: 'feature' }] }],
  ['PR result instead of main push', { ci: [{ ...success, event: 'pull_request' }] }],
  ['malformed JSON', { ciRaw: '{' }], ['invalid shape', { ciRaw: '{}' }],
  ['query error', { ciError: true }],
]) {
  test('main CI rejects ' + name + ' before any PR write', async () => {
    const f = fixture(options); await assert.rejects(runPromote({}, f)); assert.equal(writes(f.calls).length, 0);
  });
}
test('same-SHA successful main push CI passes', () => {
  const f = fixture(); assert.equal(checkMainCiStatus({ headSha: HEAD, gh: f.gh }).databaseId, 123);
  const query = f.calls[0]; assert.ok(query.includes('--branch')); assert.ok(query.includes('--event'));
});
test('dry-run checks main without PR writes', async () => {
  const f = fixture(); assert.equal(await runPromote({ dryRun: true }, f), 0); assert.equal(writes(f.calls).length, 0);
});
test('already aligned branches do not query or write GitHub', async () => {
  const f = fixture({ prod: HEAD }); await runPromote({}, f); assert.equal(f.calls.filter(c => c[0] === 'gh').length, 0);
});
test('programmatic callers cannot skip PR checks', async () => {
  const f = fixture(); await assert.rejects(runPromote({ skipCiWait: true }, f)); assert.equal(writes(f.calls).length, 0);
});
test('PR checks failure cannot fall through to merge', async () => {
  const f = fixture({ checksError: true }); await assert.rejects(runPromote({}, f), /PR checks failed/); assert.equal(merges(f.calls).length, 0);
});
for (const [name, checks] of [
  ['empty', []], ['all skipped', [{ ...passChecks[0], bucket: 'skipping' }]],
  ['pending', [{ ...passChecks[0], bucket: 'pending' }]], ['failed', [{ ...passChecks[0], bucket: 'fail' }]],
  ['wrong workflow', [{ ...passChecks[0], workflow: 'unrelated' }]],
  ['wrong run provenance', [{ ...passChecks[0], link: 'https://github.com/WardLu/shadow-mate/actions/runs/999/job/456' }]],
  ['unrelated PR check', [{ ...passChecks[0], event: 'pull_request', link: 'https://github.com/unrelated/repo/actions/runs/456/job/789' }]],
  ['another check failed', [...passChecks, { name: 'CodeQL', bucket: 'fail' }]],
]) {
  test('PR checks reject ' + name, async () => {
    const f = fixture({ checks }); await assert.rejects(runPromote({}, f)); assert.equal(merges(f.calls).length, 0);
  });
}
for (const [name, pr] of [
  ['head drift', { headRefOid: PROD }], ['wrong base', { baseRefName: 'main' }],
  ['wrong source', { headRefName: 'feature' }], ['fork', { isCrossRepository: true }],
  ['draft', { isDraft: true }], ['closed', { state: 'CLOSED' }],
]) {
  test('PR identity rejects ' + name, async () => {
    const f = fixture({ pr }); await assert.rejects(runPromote({}, f)); assert.equal(merges(f.calls).length, 0);
  });
}
test('PR head changing while checks run is rejected', async () => {
  const f = fixture({ prAfterWait: { headRefOid: PROD } }); await assert.rejects(runPromote({}, f)); assert.equal(merges(f.calls).length, 0);
});
test('main changing while checks run is rejected', async () => {
  const f = fixture({ movedHead: true }); await assert.rejects(runPromote({}, f)); assert.equal(merges(f.calls).length, 0);
});
test('new main CI failure during wait is rejected', async () => {
  const f = fixture({ ciAfterWait: [{ ...success, conclusion: 'failure' }] });
  await assert.rejects(runPromote({}, f)); assert.equal(merges(f.calls).length, 0);
});
test('invalid or unconfirmed PR numbers never reach merge', async () => {
  for (const prs of [[], [{ number: null }], [{ number: '450' }]]) {
    const f = fixture({ prs }); await assert.rejects(runPromote({}, f)); assert.equal(merges(f.calls).length, 0);
  }
});
test('verified merge pins head and never uses administrator bypass', async () => {
  const f = fixture(); assert.equal(await runPromote({}, f), 0);
  const merge = merges(f.calls); assert.equal(merge.length, 1);
  assert.ok(!merge[0].includes('--admin')); assert.ok(merge[0].includes('--match-head-commit'));
  assert.equal(merge[0][merge[0].indexOf('--match-head-commit') + 1], HEAD);
  assert.ok(f.calls.some(c => c[0] === 'git' && c[1] === 'merge-base'));
});
for (const [name, options] of [
  ['queued rather than merged', { queued: true }], ['remote points elsewhere', { remoteMergedSha: PROD }],
  ['tree mismatch', { treeMismatch: true }], ['main is not ancestor', { notAncestor: true }],
]) {
  test('readback refuses success when ' + name, async () => {
    const f = fixture(options); await assert.rejects(runPromote({}, f)); assert.equal(merges(f.calls).length, 1);
  });
}
test('PR creation records only verified facts and requires readback', () => {
  let lists = 0; let body;
  const gh = args => {
    if (args[1] === 'list') return JSON.stringify(++lists === 1 ? [] : [{ number: 450 }]);
    if (args[1] === 'create') { body = args[args.indexOf('--body') + 1]; return ''; }
    throw Error('unexpected call');
  };
  assert.equal(getOrCreatePromotionPr({ headSha: HEAD, gh }).number, 450);
  assert.ok(body.includes(HEAD)); assert.ok(!body.includes('[x]')); assert.ok(!body.includes('本地离线准入验证通过'));
});

for (const [name, options] of [
  ['candidate tree drift', { candidateMismatch: true }], ['merge conflict', { mergeConflict: true }],
  ['wrong repository', { origin: 'https://github.com/somebody/other.git' }],
  ['wrong host', { origin: 'https://example.invalid/WardLu/shadow-mate.git' }],
]) {
  test('pre-write rejects ' + name, async () => {
    const f = fixture(options); await assert.rejects(runPromote({}, f)); assert.equal(writes(f.calls).length, 0);
  });
}
test('SSH origin is accepted and every GitHub command explicitly pins host and repository', async () => {
  const f = fixture({ origin: 'git' + '@' + 'github.com:WardLu/shadow-mate.git' });
  await runPromote({}, f);
  for (const c of f.calls.filter(c => c[0] === 'gh')) {
    assert.equal(c[c.indexOf('--repo') + 1], 'github.com/WardLu/shadow-mate');
  }
});

test('PR retargeting while checks run is rejected before merge', async () => {
  const f = fixture({ prAfterWait: { baseRefName: 'staging' } });
  await assert.rejects(runPromote({}, f)); assert.equal(merges(f.calls).length, 0);
});

for (const divergent of [false, true]) {
  test('real merge-tree ' + (divergent ? 'rejects production-only content' : 'accepts equivalent trees with divergent history'), () => {
    const dir = mkdtempSync(join(tmpdir(), 'portal-promotion-tree-'));
    const git = args => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false',
      '-c', 'user.name=Promotion Test', '-c', 'user.email=promotion@example.com', ...args],
      { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: dir, GIT_CONFIG_NOSYSTEM: '1' } }).trim();
    try {
      git(['init', '--initial-branch=main']);
      writeFileSync(join(dir, 'base.txt'), 'base'); git(['add', '.']); git(['commit', '-m', 'base']);
      git(['switch', '-c', 'production']);
      if (divergent) { writeFileSync(join(dir, 'production-only.txt'), 'extra'); git(['add', '.']); }
      git(['commit', '--allow-empty', '-m', 'production history']);
      const baseSha = git(['rev-parse', 'HEAD']);
      git(['switch', 'main']); writeFileSync(join(dir, 'main.txt'), 'candidate'); git(['add', '.']); git(['commit', '-m', 'main candidate']);
      const headSha = git(['rev-parse', 'HEAD']);
      if (divergent) assert.throws(() => verifyPromotionTree(headSha, baseSha, git), /候选合并树/);
      else verifyPromotionTree(headSha, baseSha, git);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}


test('configured gate names are produced by the checked-in workflow', async () => {
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.ok(text.includes('name: ' + workflow));
  assert.ok(text.includes('name: ' + gate) || /\n  verify:/.test(text) && gate === 'verify');
  assert.ok(text.includes('name: ' + enforcement));
});
for (const [name, options] of [
  ['main fetch fails', { fetchError: true }], ['proof lookup fails', { proofError: true }],
  ['aggregate skipped', { proof: { jobs: [{ name: gate, status: 'completed', conclusion: 'skipped', steps: [] }] } }],
  ['enforcement step missing', { proof: { jobs: [{ name: gate, status: 'completed', conclusion: 'success', steps: [] }] } }],
  ['proof SHA differs', { proof: { headSha: PROD } }],
]) {
  test('CI evidence rejects ' + name + ' before PR writes', async () => {
    const f = fixture(options); await assert.rejects(runPromote({}, f)); assert.equal(writes(f.calls).length, 0);
  });
}
test('successful PR-event aggregate validates its own run proof', async () => {
  const checks = [{ ...passChecks[0], event: 'pull_request', link: 'https://github.com/WardLu/shadow-mate/actions/runs/456/job/789' }];
  const f = fixture({ checks }); await runPromote({}, f); assert.equal(merges(f.calls).length, 1);
});

test('main promotion cannot automatically deploy a production-only project', async () => {
  const f = fixture(); await assert.rejects(runPromote({ deploy: true }, f), /production 工作区/); assert.equal(writes(f.calls).length, 0);
});
test('dry-run with deploy option performs only preflight', async () => {
  const f = fixture(); await runPromote({ deploy: true, dryRun: true }, f); assert.equal(writes(f.calls).length, 0);
});
