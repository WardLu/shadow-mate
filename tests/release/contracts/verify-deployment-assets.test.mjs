import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {verifyAssets} from '../../../scripts/release/verify-deployment-assets.mjs';
for(const mode of ['candidate','production','mismatch','denied'])test(`artifact verification ${mode}`,async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'assets-fixture-'));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(path.join(root,'config'));await mkdir(path.join(root,'.vercel/output/static/assets'),{recursive:true});await writeFile(path.join(root,'config/release-production.json'),JSON.stringify({vercel:{teamId:'team_fixture',productionDomains:['example.invalid']}}));await writeFile(path.join(root,'.vercel/output/static/assets/main.js'),'expected');
 let called=0;const run=(command,args)=>{called++;assert.equal(command,mode==='production'?'curl':'vercel');writeFileSync(args[args.indexOf('-o')+1],mode==='mismatch'?'wrong':'expected');return {status:mode==='denied'?22:0,stdout:mode==='denied'?'403':'200'};};
 const options={root,run,deploymentUrl:mode==='production'?undefined:'https://fixture.vercel.app'};
 if(['mismatch','denied'].includes(mode))await assert.rejects(verifyAssets(options),/artifact_/);else assert.equal((await verifyAssets(options)).assets,1);assert.equal(called,1);
});
