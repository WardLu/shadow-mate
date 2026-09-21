import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const helper = fileURLToPath(new URL('../../../scripts/release/vercel-project-binding.mjs', import.meta.url));
const config = {vercel:{teamId:'team_expected',projectId:'prj_expected',projectName:'fixture',projectRoot:'.'}};
function fixture(t) {
 const dir=mkdtempSync(path.join(os.tmpdir(),'vercel-binding-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));mkdirSync(path.join(dir,'config'));
 writeFileSync(path.join(dir,'config/release-production.json'),JSON.stringify(config));return dir;
}
function run(dir,args=[],env={},input) {
 const clean={...process.env};delete clean.VERCEL_PROJECT_ID;delete clean.VERCEL_ORG_ID;
 return spawnSync(process.execPath,[helper,...args],{cwd:dir,env:{...clean,...env},input,encoding:'utf8'});
}
test('unlinked checkout is linked to configured identity without network',t=>{
 const d=fixture(t);assert.equal(run(d).status,0);const link=JSON.parse(readFileSync(path.join(d,'.vercel/project.json')));
 assert.equal(link.projectId,'prj_expected');assert.equal(link.orgId,'team_expected');assert.equal(run(d,['--check']).status,0);
});
for (const key of ['VERCEL_PROJECT_ID','VERCEL_ORG_ID']) test(`rejects conflicting ${key} before writing`,t=>{
 const d=fixture(t);const r=run(d,[],{[key]:'wrong'});assert.notEqual(r.status,0);assert.match(r.stderr,/environment_mismatch/);
});
test('wrong existing link is rejected and preserved',t=>{
 const d=fixture(t);mkdirSync(path.join(d,'.vercel'));const f=path.join(d,'.vercel/project.json');const original=JSON.stringify({projectId:'prj_wrong',orgId:'team_expected'});writeFileSync(f,original);
 assert.match(run(d).stderr,/link_mismatch/);assert.equal(readFileSync(f,'utf8'),original);
});
test('check mode does not recreate missing link',t=>{
 const d=fixture(t);assert.match(run(d,['--check']).stderr,/link_missing/);
});
test('detects link drift after pull',t=>{
 const d=fixture(t);assert.equal(run(d).status,0);writeFileSync(path.join(d,'.vercel/project.json'),JSON.stringify({projectId:'prj_changed',orgId:'team_expected'}));assert.match(run(d,['--check']).stderr,/link_mismatch/);
});
test('deployment must belong to configured project and team',t=>{
 const d=fixture(t);const good={projectId:'prj_expected',ownerId:'team_expected',readyState:'READY',target:'production',meta:{releaseCommitSha:'a'.repeat(40)}};
 assert.equal(run(d,['--deployment','a'.repeat(40)],{},JSON.stringify(good)).status,0);
 for(const change of [{projectId:'prj_other'},{ownerId:'team_other'},{readyState:'ERROR'},{target:null},{meta:{releaseCommitSha:'b'.repeat(40)}}]) assert.notEqual(run(d,['--deployment','a'.repeat(40)],{},JSON.stringify({...good,...change})).status,0);
});
test('invalid config and malformed link fail closed',t=>{
 const d=fixture(t);mkdirSync(path.join(d,'.vercel'));writeFileSync(path.join(d,'.vercel/project.json'),'{');assert.notEqual(run(d).status,0);
 writeFileSync(path.join(d,'config/release-production.json'),JSON.stringify({vercel:{}}));assert.notEqual(run(d).status,0);
});
