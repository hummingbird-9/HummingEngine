import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repository = (process.env.GITHUB_REPOSITORY || 'hummingbird-9/HummingEngine').split('/')[1];
const isUserSite = repository.toLowerCase().endsWith('.github.io');
const basePath = (process.env.PAGES_BASE_PATH || (isUserSite ? '/' : `/${repository}/`))
  .replace(/\/?$/, '/');
const output = resolve(root, '_site');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(root, 'public'), output, { recursive: true });

// Stage the stable Scramjet 1.x runtime and its transports for Pages.
const rootRequire = createRequire(resolve(root, 'package.json'));
const rootPackage = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (rootPackage.dependencies['@mercuryworkshop/scramjet'] !== '1.1.0') {
  throw new Error('Expected stable Scramjet 1.1.0 in the root package.');
}
const v1Folders = [
  ['scram', rootRequire('@mercuryworkshop/scramjet/path').scramjetPath],
  ['baremux', rootRequire('@mercuryworkshop/bare-mux/node').baremuxPath],
  ['libcurl', rootRequire('@mercuryworkshop/libcurl-transport').libcurlPath],
  ['epoxy', rootRequire('@mercuryworkshop/epoxy-transport').epoxyPath]
];
for (const [target, source] of v1Folders) {
  if (!source) throw new Error(`Could not resolve stable Scramjet runtime folder: ${target}`);
  await cp(source, resolve(output, target), { recursive: true });
}
for (const file of [
  'scram/scramjet.all.js',
  'scram/scramjet.sync.js',
  'scram/scramjet.wasm.wasm',
  'baremux/index.mjs',
  'baremux/worker.js',
  'libcurl/index.mjs',
  'epoxy/index.mjs'
]) {
  await readFile(resolve(output, file));
}
console.log('Included stable Scramjet 1.1.0 and matching BareMux/transports.');

// Include the pinned Scramjet 2 browser runtime in the static Pages artifact.
const v2Require = createRequire(resolve(root, 'v2/package.json'));
const v2Dir = name => dirname(v2Require.resolve(name));
const scramjetPath = v2Require('@mercuryworkshop/scramjet/path').scramjetPath;
const scramjetPackage = JSON.parse(await readFile(
  resolve(root, 'v2/node_modules/@mercuryworkshop/scramjet/package.json'),
  'utf8'
));
if (scramjetPackage.version !== '2.0.67-alpha.2') {
  throw new Error(`Expected Scramjet 2.0.67-alpha.2, found ${scramjetPackage.version}`);
}
const runtimeFolders = [
  ['v2-scram', scramjetPath],
  ['v2-controller', v2Dir('@mercuryworkshop/scramjet-controller')],
  ['v2-utils', v2Dir('@mercuryworkshop/scramjet-utils')],
  ['v2-libcurl', v2Dir('@mercuryworkshop/libcurl-transport')],
  ['v2-epoxy', v2Dir('@mercuryworkshop/epoxy-transport')]
];
for (const [target, source] of runtimeFolders) {
  if (!source) throw new Error(`Could not resolve Scramjet runtime folder: ${target}`);
  await cp(source, resolve(output, target), { recursive: true });
}
for (const file of [
  'v2-scram/scramjet.js',
  'v2-scram/scramjet.wasm',
  'v2-controller/controller.api.js',
  'v2-controller/controller.inject.js',
  'v2-controller/controller.sw.js',
  'v2-utils/scramjet-utils.js',
  'v2-libcurl/index.mjs',
  'v2-epoxy/index.mjs'
]) {
  await readFile(resolve(output, file));
}
console.log(`Included Scramjet ${scramjetPackage.version} and matching controller, utils, and transports.`);

const indexPath = resolve(output, 'index.html');
let index = await readFile(indexPath, 'utf8');
index = index.replace('<meta name="app-base" content="">', `<meta name="app-base" content="${basePath}">`);
index = index.replace('<meta name="app-host" content="server">', '<meta name="app-host" content="github-pages">');
index = index.replace('<base href="/">', `<base href="${basePath}">`);
await writeFile(indexPath, index);

const notFound = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Opening HummingProxy…</title></head>
<body>
<script>
  const base = ${JSON.stringify(basePath)};
  const requested = new URL(location.href);
  const params = requested.searchParams;
  if (params.has('q') || params.has('open') || params.has('popup')) {
    location.replace(base + requested.search + requested.hash);
  } else {
    location.replace(base);
  }
</script>
<noscript>Open <a href="${basePath}">HummingProxy</a>.</noscript>
</body>
</html>
`;
await writeFile(resolve(output, '404.html'), notFound);
await writeFile(resolve(output, '.nojekyll'), '');
console.log(`Built GitHub Pages site at ${output} with base path ${basePath}`);
