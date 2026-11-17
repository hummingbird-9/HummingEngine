import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
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
