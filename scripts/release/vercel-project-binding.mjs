// config/release-production.json is the sole source of deployment identity.
import { readFileSync, writeFileSync, mkdirSync, lstatSync } from 'node:fs';
import path from 'node:path';

const fail = (reason) => { throw new Error(reason); };
try {
  const mode = process.argv[2];
  if (process.argv.length > (mode === '--deployment' ? 4 : 3) || (mode && !['--check', '--deployment'].includes(mode))) fail('vercel_binding_arguments_invalid');
  const config = JSON.parse(readFileSync('config/release-production.json', 'utf8')).vercel;
  if (!/^team_[A-Za-z0-9]+$/.test(config?.teamId ?? '') ||
      !/^prj_[A-Za-z0-9]+$/.test(config?.projectId ?? '') || !config?.projectName) fail('vercel_binding_config_invalid');
  for (const [key, expected] of [['VERCEL_ORG_ID', config.teamId], ['VERCEL_PROJECT_ID', config.projectId]]) {
    if (process.env[key] !== undefined && process.env[key] !== expected) fail('vercel_binding_environment_mismatch');
  }
  if (mode === '--deployment') {
    const deployment = JSON.parse(readFileSync(0, 'utf8'));
    const expectedSha = process.argv[3];
    if (!/^[a-f0-9]{40}$/.test(expectedSha ?? '') || deployment.meta?.releaseCommitSha !== expectedSha) fail('vercel_deployment_commit_mismatch');
    if (deployment.projectId !== config.projectId || (deployment.ownerId ?? deployment.teamId) !== config.teamId ||
        deployment.readyState !== 'READY' || deployment.target !== 'production') fail('vercel_deployment_identity_mismatch');
  } else {
    // The production entrypoint runs at the repository root, including monorepos.
    const directory = path.resolve('.vercel');
    const file = path.join(directory, 'project.json');
    for (const target of [directory, file]) {
      try { if (lstatSync(target).isSymbolicLink()) fail('vercel_binding_symlink_rejected'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    let link;
    try { link = JSON.parse(readFileSync(file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (mode === '--check') fail('vercel_binding_link_missing');
      mkdirSync(directory, { recursive: true });
      link = { projectId: config.projectId, orgId: config.teamId, projectName: config.projectName };
      writeFileSync(file, `${JSON.stringify(link, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    }
    if (link.projectId !== config.projectId || link.orgId !== config.teamId) fail('vercel_binding_link_mismatch');
  }
  console.log(`Vercel identity verified: ${config.teamId}/${config.projectId}`);
} catch (error) {
  console.error(/^vercel_[a-z_]+$/.test(error.message) ? error.message : 'vercel_binding_invalid');
  process.exitCode = 1;
}
