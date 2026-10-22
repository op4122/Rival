// Copies the pinned browser builds from node_modules into app/vendor, so the app loads them from its own
// origin: they work offline (the service worker caches them) and no third-party CDN is involved.
// Run after changing a version in package.json:  npm install && npm run vendor
import { copyFileSync, readFileSync, mkdirSync } from 'node:fs';
const files = [
  ['@supabase/supabase-js', 'dist/umd/supabase.js', 'supabase.js'],
  ['dexie', 'dist/dexie.min.js', 'dexie.js'],
  ['posthog-js', 'dist/array.full.no-external.js', 'posthog.js'],
];
mkdirSync('app/vendor', { recursive: true });
for (const [pkg, from, to] of files) {
  const v = JSON.parse(readFileSync(`node_modules/${pkg}/package.json`, 'utf8')).version;
  copyFileSync(`node_modules/${pkg}/${from}`, `app/vendor/${to}`);
  console.log(`${pkg}@${v} -> app/vendor/${to}`);
}
