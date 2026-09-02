import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { getActiveHanziWritingPack } from "../src/content/hanzi-writing/manifest.js";
import { validateHanziWritingPack } from "../src/content/hanzi-writing/validate-pack.js";
import {
  listActivePiperCdnVoicePackages,
  listBundledPiperRuntimePackages,
  listPiperResourcePackages,
  validatePiperResourcePackages,
} from "../src/piper-resource-registry.js";

const requiredFiles = [
  "index.html",
  "privacy-policy.html",
  "public/privacy-policy.css",
  "public/manifest.json",
  "public/sw.js",
  "public/piper-tts-web.js",
  "public/onnx/ort-wasm-simd-threaded.wasm",
  "public/piper/piper_phonemize.wasm",
  "public/piper/piper_phonemize.data",
  "src/cache-policy.js",
  "src/piper-resource-registry.js",
  "src/piper-resource-store.js",
  "src/piper-resource-hash.js",
  "src/piper-resource-capabilities.js",
  "src/piper-resource-ui.js",
  "scripts/piper-resource-smoke.mjs",
  "src/config.js",
  "src/lib.js",
  "src/cloud.js",
  "src/app.js",
  "src/app.css",
  "src/content/hanzi-writing/v2-pilot-1.json",
  "src/content/hanzi-writing/manifest.js",
  "src/content/hanzi-writing/validate-pack.js",
  "SECURITY.md",
  "PRIVACY.md",
  "CONTRIBUTING.md",
  "TRADEMARKS.md",
  "THIRD_PARTY_NOTICES.md",
  ".vercelignore",
  "supabase/tests/learning_rls_test.sql",
  "supabase/migrations/20260811202411_child_privacy_consent.sql",
];

for (const file of requiredFiles) {
  await readFile(file).catch(() => {
    throw new Error(`Missing required artifact: ${file}`);
  });
}

const activeHanziWritingPack = getActiveHanziWritingPack();
const hanziWritingPackValidation = validateHanziWritingPack(activeHanziWritingPack);
if (!hanziWritingPackValidation.valid) {
  throw new Error(`Hanzi writing pack validation failed:\n- ${hanziWritingPackValidation.errors.join("\n- ")}`);
}

validatePiperResourcePackages(listPiperResourcePackages());

const activePiperCdnPackages = listActivePiperCdnVoicePackages();
if (activePiperCdnPackages.length === 0) throw new Error("At least one approved Piper CDN voice package is required");
for (const resourcePackage of activePiperCdnPackages) {
  if (resourcePackage.license?.status !== "approved"
    || resourcePackage.provenance?.status !== "verified"
    || resourcePackage.distribution?.status !== "approved") {
    throw new Error(`Active Piper CDN package ${resourcePackage.id} is missing approved license, provenance, or distribution metadata`);
  }
}

async function fingerprint(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

for (const resourcePackage of listBundledPiperRuntimePackages()) {
  for (const file of resourcePackage.files) {
    const path = `public${file.url}`;
    const actual = await stat(path);
    if (actual.size !== file.bytes) throw new Error(`Bundled Piper runtime ${path} byte size does not match the registry`);
    if (await fingerprint(path) !== file.sha256) throw new Error(`Bundled Piper runtime ${path} SHA-256 does not match the registry`);
  }
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
if (!config.includes('const PRODUCTION_SUPABASE_URL = "https://dutepjyocxcvecmsrtfp.supabase.co"')) {
  throw new Error("Production Supabase URL must remain explicit and auditable");
}
if (!/const PRODUCTION_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_[^"]+"/.test(config)) {
  throw new Error("Browser configuration must use a Supabase publishable key");
}
if (!config.includes('VITE_SHADOW_ALLOW_PRODUCTION_SUPABASE')) {
  throw new Error("Non-production production-Supabase access must require an explicit override");
}
if (!config.includes('remote_supabase_blocked')) {
  throw new Error("Non-production remote Supabase connections must fail closed");
}

const serviceWorker = await readFile("public/sw.js", "utf8");
if (!serviceWorker.includes('CACHE_NAME = "shadow-mate-app-v4"')) {
  throw new Error("Service worker cache must use shadow-mate-app-v4");
}
if (!serviceWorker.includes("/^shadow-mate-app-v\\d+$/.test(name) || /^shadow-mate-v\\d+$/.test(name)")) {
  throw new Error("Service worker must define the app-shell preservation predicate");
}
if (!serviceWorker.includes(
  "keys.filter((key) => isAppShellCacheName(key) && key !== CACHE_NAME).map((key) => caches.delete(key))"
)) {
  throw new Error("Service worker activation cleanup must be constrained to app-shell caches");
}
if (/caches\.keys\(\)\s*\.then\(\(keys\)\s*=>\s*Promise\.all\(keys\.map\(.*caches\.delete/s.test(serviceWorker)) {
  throw new Error("Service worker must not delete every cache");
}

const cachePolicy = await readFile("src/cache-policy.js", "utf8");
for (const marker of [
  'APP_SHELL_CACHE_NAME = "shadow-mate-app-v4"',
  "/^shadow-mate-app-v\\d+$/.test(name) || /^shadow-mate-v\\d+$/.test(name)",
  "key !== currentName",
]) {
  if (!cachePolicy.includes(marker)) throw new Error(`src/cache-policy.js is missing ${marker}`);
}

const versionGuard = await readFile("src/version-guard.js", "utf8");
if (!versionGuard.includes('from "./cache-policy.js"')) {
  throw new Error("version guard must use the cache policy");
}
if (!versionGuard.includes("selectCacheNamesToDelete(keys).map((key) => cacheStorage.delete(key))")) {
  throw new Error("version guard must delete only stale app-shell caches");
}
if (/caches\.keys\(\)[\s\S]*?keys\.map\(\(key\)\s*=>\s*caches\.delete/.test(versionGuard)) {
  throw new Error("Version guard must not delete every cache");
}

const piperResourceUi = await readFile("src/piper-resource-ui.js", "utf8");
if (!piperResourceUi.includes('from "./piper-resource-registry.js"')) {
  throw new Error("Piper resource UI must source package metadata from the registry");
}
if (!piperResourceUi.includes("listActivePiperCdnVoicePackages")) {
  throw new Error("Piper resource UI must present only active CDN voice packages");
}
if (!piperResourceUi.includes("resourcePackage.totalBytes")) {
  throw new Error("Piper resource UI must render voice sizes from registered package bytes");
}
if (/\b(?:90|115)\s*MB\b/i.test(piperResourceUi)) {
  throw new Error("Piper resource UI must not contain fixed voice-size copy");
}
if (/\.arrayBuffer\s*\(/.test(piperResourceUi)) {
  throw new Error("Piper resource UI must use verified marker bytes instead of materializing cached files");
}

const piperResourceStore = await readFile("src/piper-resource-store.js", "utf8");
if (/\.arrayBuffer\s*\(/.test(piperResourceStore)) {
  throw new Error("Piper resource store must validate cached files incrementally");
}

const cloud = await readFile("src/cloud.js", "utf8");
for (const marker of [
  'from "@supabase/supabase-js"',
  'const ACTIVE_PROFILE_KEY = `${PRODUCT_ID.replaceAll("-", "_")}_active_profile`',
  "storage: window.sessionStorage",
  "const AUTH_REDIRECT_ORIGIN = CLOUD_CONFIG.authRedirectOrigin || window.location.origin",
  "readRememberedProfileId()",
  '"serviceWorker" in navigator && window.isSecureContext',
  'if (document.readyState === "complete") registerServiceWorker()',
  "gradeOptionsSelected",
  "GUARDIAN_CONSENT_TYPE",
  'from("learning_guardian_consents")',
]) {
  if (!cloud.includes(marker)) throw new Error(`cloud.js is missing ${marker}`);
}
if (/https:\/\/esm\.sh/i.test(cloud)) {
  throw new Error("Runtime CDN imports are not allowed");
}

const piper = await readFile("src/piper-tts.js", "utf8");
for (const marker of [
  'export const VOICE = "https://voice.shadow.wang/piper/en_US-ljspeech-medium"',
  'export const VOICE_FILES',
]) {
  if (!piper.includes(marker)) throw new Error(`piper-tts.js is missing ${marker}`);
}
for (const marker of ["resourcePackage.label", "resourcePackage.version", "formatPiperResourceBytes(resourcePackage.totalBytes)", "location?.origin"]) {
  if (!piper.includes(marker)) throw new Error(`Piper speech dialog is missing registry-driven copy: ${marker}`);
}
if (/\b(?:90|115)\s*MB\b/i.test(piper)) throw new Error("Piper speech dialog must not contain fixed voice-size copy");

const userGuide = await readFile("docs/user-guide.md", "utf8");
if (/\b(?:90|115)\s*MB\b/i.test(userGuide)) throw new Error("User guide must not contain fixed Piper package-size copy");

const migrationDir = "supabase/migrations";
const migrations = (await readdir(migrationDir)).filter((name) => name.endsWith(".sql")).sort();
const registryMigrationName = migrations.find((name) => name.endsWith("_projects_registry_compat.sql"));
const registryRestrictionName = migrations.find((name) =>
  name.endsWith("_restrict_project_registry_access.sql")
);
const accountDeletionAccessName = migrations.find((name) =>
  name.endsWith("_learning_account_deletion_service_access.sql")
);
const baseMigrationName = migrations.find((name) => name.endsWith("_learning_family_state.sql"));
if (!registryMigrationName || !registryRestrictionName || !accountDeletionAccessName || !baseMigrationName) {
  throw new Error("Required Supabase migrations are missing");
}
if (migrations.indexOf(registryMigrationName) >= migrations.indexOf(baseMigrationName)) {
  throw new Error("The standalone project registry migration must run before the base schema");
}
if (migrations.indexOf(accountDeletionAccessName) <= migrations.indexOf(baseMigrationName)) {
  throw new Error("Account deletion service access must run after the learning schema");
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

const accountDeletionAccess = await readFile(join(migrationDir, accountDeletionAccessName), "utf8");
for (const marker of [
  "grant select (project_id) on table public.projects to service_role",
  "alter table public.learning_households enable row level security",
]) {
  if (!accountDeletionAccess.includes(marker)) {
    throw new Error(`Account deletion service access is missing safety step: ${marker}`);
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
for (const source of ["/privacy", "/privacy/"]) {
  const route = vercel.rewrites?.find((item) => item.source === source);
  if (route?.destination !== "/privacy.html") {
    throw new Error(`Vercel privacy route ${source} must serve the built privacy.html`);
  }
}
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
