# HummingProxy

Scramjet 1.1.0 and BareMux 2.x with a TypeScript Fastify server. The homepage retains the supplied HummingbirdTech logo, custom text and forest-green CSS. It has device-local bookmarks with a hideable bar, fullscreen state control, cosmetic ad hiding and Google default search.

## Render deployment with Tor

This version includes a Dockerfile that installs the Tor daemon and the Python Wisp server. The Wisp process is configured to use `socks5h://127.0.0.1:9050` and block UDP. HummingProxy verifies the Tor exit through `check.torproject.org/api/ip` before reporting Tor available and accepting `/tor-wisp/` WebSocket connections.

The existing Render service is **Node**. Merely uploading Dockerfile does **not** switch its runtime. To use built-in Tor, create a Render Docker service using this repository, `Dockerfile` at repo root, and the Free plan, or use a Blueprint from `render.yaml`. This may result in a different service URL. If remaining on the current Node service, Tor stays unavailable unless a separately configured Tor Wisp is provided.

Docker free-tier compatibility is not guaranteed: 512 MB memory and limited CPU can make Tor bootstrap slow or result in service restarts. Logs should be checked for Tor bootstrap, Python Wisp startup and port binding. The check endpoint must be reachable. Tor availability is verified, not assumed.

The Python Wisp server is AGPL-3.0 licensed. Review the relevant license and source-sharing requirements before distributing or operating a modified version. It is installed from PyPI in the Docker image.

## Existing Node runtime without Tor

Build command: `npm install && npm run build`

Start command: `npm start`

The regular Wisp relay runs in the Node server. Built-in Tor is only available with the Docker stack. `TOR_WISP_URL` remains an optional external route.

## Notes

Tabs and bookmarks are stored locally on the device. Tabs restore as URLs after reload, and load individually when selected to conserve Chromebook memory. Tabs are limited to five. Bookmark removal is available through right-click or long context menu.

The loader now sizes the supplied PNG without stretching it. If the PNG itself is low resolution, browsers cannot add missing pixels; use a larger copy of the same image to fully resolve blur.

The project hasn't been tested against Render's live Docker build, third-party websites, managed Chromebooks or a Tor bootstrap under the Free plan. A 404 during Render cold start or network policy blocks cannot be fixed by frontend changes alone. Some sites break under Scramjet due to browser, worker or site compatibility. Do not treat this as an anonymity guarantee: the hosting provider and relay can observe connection metadata and endpoints can identify the browser.

Public Wisp endpoints can be abused. Do not share a public deployment widely without rate limiting, access controls and outbound abuse prevention.

## Scramjet 2 experimental engine

Settings → Scramjet version switches between the default stable 1.x and experimental 2.x. Changing engines reloads the shell and existing open frames; saved tab addresses and bookmarks are retained. Version 2 is installed into an isolated `v2/node_modules` directory during `npm run build`, because its transport majors and controller are incompatible with 1.x. Its worker only controls `/v2/` paths. The build needs npm registry access. Version 2 has not been end-to-end browser-tested in this release.

## Custom search engine

In Chrome Settings → Search engine → Manage search engines and site search → Add, set Search engine to `HummingProxy`, shortcut to `hp`, URL with %s to `https://hummingproxy.onrender.com/?q=%s`. Chrome may offer `Make default` in the row menu; school-managed browsers may prohibit this. The proxy loads your configured search engine after startup. This does not make Google use HummingProxy automatically.

There is no application tab limit. Tabs shrink to 42px and then scroll horizontally; device RAM remains the practical limit.
