import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root=path.resolve(import.meta.dirname,'../../..');
function git(cwd,...args) { const r=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim(); }
function fixture(t) {
 const base=mkdtempSync(path.join(os.tmpdir(),'mate-release-gate-'));t.after(()=>rmSync(base,{recursive:true,force:true}));const repo=path.join(base,'repo'),bin=path.join(base,'bin');mkdirSync(path.join(repo,'scripts/release'),{recursive:true});mkdirSync(path.join(repo,'config'));mkdirSync(bin);
 for(const file of ['deploy-production.sh','vercel-project-binding.mjs'])copyFileSync(path.join(root,'scripts/release',file),path.join(repo,'scripts/release',file));
 writeFileSync(path.join(repo,'package.json'),JSON.stringify({name:'fixture'}));writeFileSync(path.join(repo,'config/release-production.json'),JSON.stringify({productionBranch:'production',vercel:{teamId:'team_test',projectId:'prj_test',projectName:'fixture'}}));writeFileSync(path.join(repo,'.gitignore'),'.vercel/\n');
 writeFileSync(path.join(bin,'mise'),`#!/bin/sh\nprintf '%s\\n' '${path.dirname(path.dirname(process.execPath))}'\n`,{mode:0o755});
 writeFileSync(path.join(bin,'vercel'),'#!/bin/sh\nprintf "%s|%s|%s\\n" "$*" "$VERCEL_ORG_ID" "$VERCEL_PROJECT_ID" > "$CALL_LOG"\nexit 77\n',{mode:0o755});
 git(repo,'init','-b','production');git(repo,'config','user.name','Fixture');git(repo,'config','user.email','fixture@example.test');git(repo,'add','.');git(repo,'commit','-m','fixture');git(base,'init','--bare','remote.git');git(repo,'remote','add','origin',path.join(base,'remote.git'));git(repo,'push','-u','origin','production');return {base,repo,bin};
}
function run(f,extra={}) {const env={...process.env};delete env.VERCEL_PROJECT_ID;delete env.VERCEL_ORG_ID;return spawnSync('bash',['scripts/release/deploy-production.sh'],{cwd:f.repo,env:{...env,PATH:f.bin+':'+env.PATH,CALL_LOG:path.join(f.base,'calls'),...extra},encoding:'utf8'});}
for(const mode of ['dirty','branch','unpushed','environment'])test(`${mode} fails before Vercel writes`,t=>{
 const f=fixture(t);if(mode==='dirty')writeFileSync(path.join(f.repo,'untracked'),'x');if(mode==='branch')git(f.repo,'switch','-c','feature');if(mode==='unpushed'){writeFileSync(path.join(f.repo,'new'),'x');git(f.repo,'add','.');git(f.repo,'commit','-m','unpushed');}
 const r=run(f,mode==='environment'?{VERCEL_PROJECT_ID:'prj_wrong'}:{});assert.notEqual(r.status,0);assert.equal(existsSync(path.join(f.base,'calls')),false);assert.equal(existsSync(path.join(f.repo,'.vercel/project.json')),false);
});
test('clean production reaches only mocked pull with authoritative environment',t=>{const f=fixture(t);const r=run(f);assert.equal(r.status,77,r.stdout+r.stderr);assert.match(readFileSync(path.join(f.base,'calls'),'utf8'),/pull .*\|team_test\|prj_test/);});
test('advanced remote is rejected even when local tracking ref is stale',t=>{const f=fixture(t);git(f.base,'clone',path.join(f.base,'remote.git'),'other');const other=path.join(f.base,'other');git(other,'switch','production');git(other,'config','user.name','Fixture');git(other,'config','user.email','fixture@example.test');writeFileSync(path.join(other,'advanced'),'x');git(other,'add','.');git(other,'commit','-m','advanced');git(other,'push','origin','production');const r=run(f);assert.notEqual(r.status,0);assert.match(r.stderr,/真实远端/);assert.equal(existsSync(path.join(f.base,'calls')),false);});
test('a build that changes tracked files is rejected before deployment',t=>{
 const f=fixture(t);
 writeFileSync(path.join(f.bin,'vercel'),`#!/bin/sh
case "$1" in
  pull) exit 0 ;;
  build) printf 'changed' >> package.json; exit 0 ;;
  deploy) touch "$CALL_LOG"; exit 0 ;;
esac
exit 77
`,{mode:0o755});
 const r=run(f);
 assert.notEqual(r.status,0);
 assert.equal(existsSync(path.join(f.base,'calls')),false);
 assert.match(r.stderr,/工作区不干净/);
});
test('a failed post-build git status is rejected before deployment',t=>{
 const f=fixture(t),marker=path.join(f.base,'build-marker'),gitBinary=spawnSync('which',['git'],{encoding:'utf8'}).stdout.trim();
 writeFileSync(path.join(f.bin,'git'),`#!/bin/sh
if [ "$1" = status ] && [ -f "$BUILD_MARKER" ]; then exit 1; fi
exec "${gitBinary}" "$@"
`,{mode:0o755});
 writeFileSync(path.join(f.bin,'vercel'),`#!/bin/sh
case "$1" in
  pull) exit 0 ;;
  build) touch "$BUILD_MARKER"; exit 0 ;;
  deploy) touch "$CALL_LOG"; exit 0 ;;
esac
exit 77
`,{mode:0o755});
 const r=run(f,{BUILD_MARKER:marker});
 assert.notEqual(r.status,0);
 assert.equal(existsSync(path.join(f.base,'calls')),false);
 assert.match(r.stderr,/无法检查工作区/);
});
test('a failed initial git status is rejected before Vercel writes',t=>{
 const f=fixture(t),gitBinary=spawnSync('which',['git'],{encoding:'utf8'}).stdout.trim();
 writeFileSync(path.join(f.bin,'git'),`#!/bin/sh
if [ "$1" = status ]; then exit 1; fi
exec "${gitBinary}" "$@"
`,{mode:0o755});
 const r=run(f);
 assert.notEqual(r.status,0);
 assert.equal(existsSync(path.join(f.base,'calls')),false);
 assert.match(r.stderr,/无法检查工作区/);
});
