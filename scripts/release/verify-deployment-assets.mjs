import { readdir, readFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export async function verifyAssets({ root = process.cwd(), deploymentUrl, run = spawnSync }) {
  const config = JSON.parse(await readFile(path.join(root, 'config/release-production.json'), 'utf8'));
  const staticRoot = path.join(root, '.vercel/output/static');
  const assets = [];
  async function walk(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = path.posix.join(prefix, entry.name);
      if (entry.isSymbolicLink()) throw new Error('artifact_symlink_rejected');
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), relative);
      else if (/\.(?:js|css)$/.test(relative)) assets.push(relative);
    }
  }
  await walk(staticRoot);
  if (!assets.length) throw new Error('artifact_assets_missing');
  const origins = deploymentUrl ? [new URL(deploymentUrl).origin] : config.vercel.productionDomains.map(d => `https://${d}`);
  if (!origins.length) throw new Error('artifact_domains_missing');
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'release-assets-'));
  try {
    for (const origin of origins) {
      for (const [index, asset] of assets.entries()) {
        const output = path.join(temporary, String(index));
        const resource = '/' + asset.split('/').map(encodeURIComponent).join('/');
        const curl = ['--silent', '--show-error', '--fail', '--max-time', '30', '--max-filesize', '67108864', '-o', output, '-w', '%{http_code}'];
        const result = deploymentUrl
          ? run('vercel', ['curl', resource, '--deployment', origin, '--scope', config.vercel.teamId, '--yes', '--', ...curl], { cwd: root, encoding: 'utf8' })
          : run('curl', [...curl, origin + resource], { cwd: root, encoding: 'utf8' });
        if (result.status !== 0 || result.stdout.trim() !== '200') throw new Error('artifact_response_invalid');
        if (digest(await readFile(output)) !== digest(await readFile(path.join(staticRoot, asset)))) throw new Error('artifact_content_mismatch');
      }
    }
  } finally { await rm(temporary, { recursive: true, force: true }); }
  return { assets: assets.length, origins: origins.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length > 3) throw new Error('artifact_arguments_invalid');
    console.log(JSON.stringify(await verifyAssets({ deploymentUrl: process.argv[2] })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
