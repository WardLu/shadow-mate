import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const requiredFiles = [
  "index.html",
  "public/manifest.json",
  "public/sw.js",
  "src/config.js",
  "src/lib.js",
  "src/cloud.js",
  "src/app.js",
  "src/app.css",
  "SECURITY.md",
  "PRIVACY.md",
  "CONTRIBUTING.md",
  ".vercelignore",
  "supabase/tests/learning_rls_test.sql",
];

for (const file of requiredFiles) {
  await readFile(file).catch(() => {
    throw new Error(`Missing required artifact: ${file}`);
  });
}

const manifest = JSON.parse(await readFile("public/manifest.json", "utf8"));
if (manifest.name !== "影伴" || manifest.short_name !== "影伴") {
  throw new Error("PWA manifest must use the Chinese product name 影伴");
}
for (const size of ["192x192", "512x512"]) {
  if (!manifest.icons?.some((icon) => icon.sizes === size)) {
    throw new Error(`PWA manifest is missing a ${size} icon`);
  }
}

const html = await readFile("index.html", "utf8");
for (const marker of [
  "<title>影伴</title>",
  'id="accountButton"',
  'id="cloudDialog"',
  'src="/src/cloud.js"',
  'src="/src/app.js"',
]) {
  if (!html.includes(marker)) throw new Error(`index.html is missing ${marker}`);
}
if (/<style[\s>]/i.test(html)) {
  throw new Error("Inline <style> blocks are not allowed; use external CSS");
}
if (/\sstyle=["']/i.test(html)) {
  throw new Error("Inline style attributes are not allowed");
}
if (/<script(?![^>]*\ssrc=)[^>]*>/i.test(html)) {
  throw new Error("Inline <script> blocks are not allowed; use external modules");
}
if (/\sonclick\s*=/i.test(html)) {
  throw new Error("Inline event handlers are not allowed");
}

const appJs = await readFile("src/app.js", "utf8");
for (const marker of [
  'const STORE_KEY = "shadow_mate_workbench_v1"',
  "clearLocalData()",
  "window.learningDesk",
  "window.cloudSync?.schedule()",
  "buildMissingSequence",
  "toggleCheckin",
  "speechSynthesis",
]) {
  if (!appJs.includes(marker)) throw new Error(`src/app.js is missing ${marker}`);
}

const config = await readFile("src/config.js", "utf8");
if (!config.includes('productId: "shadow-mate"')) {
  throw new Error("Cloud product ID must be shadow-mate");
}
if (!/supabasePublishableKey:\s*"sb_publishable_[^"]+"/.test(config)) {
  throw new Error("Browser configuration must use a Supabase publishable key");
}

const serviceWorker = await readFile("public/sw.js", "utf8");
if (!serviceWorker.includes('CACHE_NAME = "shadow-mate-v2"')) {
  throw new Error("Service worker cache must use the Shadow Mate namespace");
}

const cloud = await readFile("src/cloud.js", "utf8");
for (const marker of [
  'from "@supabase/supabase-js"',
  'const ACTIVE_PROFILE_KEY = `${PRODUCT_ID.replaceAll("-", "_")}_active_profile`',
  "storage: window.sessionStorage",
  "readRememberedProfileId()",
  '"serviceWorker" in navigator && window.isSecureContext',
  'if (document.readyState === "complete") registerServiceWorker()',
  "gradeOptionsSelected",
]) {
  if (!cloud.includes(marker)) throw new Error(`cloud.js is missing ${marker}`);
}
if (/https:\/\/esm\.sh/i.test(cloud)) {
  throw new Error("Runtime CDN imports are not allowed");
}

const migrationDir = "supabase/migrations";
const migrations = (await readdir(migrationDir)).filter((name) => name.endsWith(".sql")).sort();
const registryMigrationName = migrations.find((name) => name.endsWith("_projects_registry_compat.sql"));
const registryRestrictionName = migrations.find((name) =>
  name.endsWith("_restrict_project_registry_access.sql")
);
const baseMigrationName = migrations.find((name) => name.endsWith("_learning_family_state.sql"));
if (!registryMigrationName || !registryRestrictionName || !baseMigrationName) {
  throw new Error("Required Supabase migrations are missing");
}
if (migrations.indexOf(registryMigrationName) >= migrations.indexOf(baseMigrationName)) {
  throw new Error("The standalone project registry migration must run before the base schema");
}

const registryMigration = await readFile(join(migrationDir, registryMigrationName), "utf8");
for (const marker of [
  "to_regclass('public.projects') is null",
  "create table public.projects",
  "enable row level security",
  "grant select (project_id, project_name)",
]) {
  if (!registryMigration.includes(marker)) {
    throw new Error(`Standalone registry migration is missing safety step: ${marker}`);
  }
}

const registryRestriction = await readFile(join(migrationDir, registryRestrictionName), "utf8");
for (const marker of [
  "revoke all on table public.projects from anon, authenticated",
  "grant select (project_id, project_name)",
]) {
  if (!registryRestriction.includes(marker)) {
    throw new Error(`Registry restriction migration is missing safety step: ${marker}`);
  }
}

const baseMigration = await readFile(join(migrationDir, baseMigrationName), "utf8");
for (const marker of [
  "shadow-mate",
  "create schema if not exists private",
  "create or replace function private.learning_is_household_owner",
  "security definer",
  "set search_path = ''",
  "private.learning_is_household_owner(household_id)",
]) {
  if (!baseMigration.includes(marker)) {
    throw new Error(`Base migration is missing security step: ${marker}`);
  }
}

const vercel = JSON.parse(await readFile("vercel.json", "utf8"));
const headerNames = new Set(
  vercel.headers?.flatMap((rule) => rule.headers?.map((header) => header.key.toLowerCase()) || [])
);
for (const name of ["content-security-policy", "strict-transport-security", "x-frame-options"]) {
  if (!headerNames.has(name)) throw new Error(`Vercel headers are missing ${name}`);
}
const cspHeader = vercel.headers?.flatMap((rule) => rule.headers || []).find((h) => h.key.toLowerCase() === "content-security-policy");
if (cspHeader && /unsafe-inline/i.test(cspHeader.value)) {
  throw new Error("Content-Security-Policy must not allow unsafe-inline");
}

const vercelIgnore = new Set(
  (await readFile(".vercelignore", "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
);
for (const pattern of [
  ".vercel/",
  ".env*",
  ".security-local-denylist",
  "node_modules/",
  "dist/",
  "supabase/",
]) {
  if (!vercelIgnore.has(pattern)) {
    throw new Error(`Vercel upload exclusions are missing ${pattern}`);
  }
}

console.log("Static checks passed.");
