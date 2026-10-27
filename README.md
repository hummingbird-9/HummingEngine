# HummingProxy

Green-themed Scramjet v1 browser proxy with TypeScript backend, Render Blueprint, libcurl/Epoxy selector, browser-local settings, search selector, basic cosmetic ad hiding, and *optional* external Tor Wisp relay.

## Deployment

1. Upload this entire folder to a GitHub repository.
2. On Render, create **New > Blueprint** and connect the repository containing `render.yaml` (or create a Node Web Service, build: `npm install && npm run build`, start: `npm start`).
3. Choose Free. Render supplies `PORT` and HTTPS.
4. Visit the assigned `https://<your-service>.onrender.com` URL.

Run locally using Node 20+: `npm install && npm run build && npm start`.

## Important realities

- Uses **Scramjet 1.1.0**, the latest stable published package identified during preparation. The upstream GitHub main branch is a different 2.x architecture, not a drop-in upgrade. Upgrading requires rewriting transport/controller wiring.
- Epoxy 2.x and libcurl 1.x are intentionally paired with bare-mux 2.x / Scramjet 1.x. Do not blindly upgrade to Epoxy 3.x or libcurl 2.x (proxy-transports APIs).
- **Tor is off by default and disabled unless `TOR_WISP_URL` points to a separately maintained, trusted `wss://` Wisp relay that *actually sends all outbound TCP traffic over Tor*. This project does not install Tor on Render. Configuring an ordinary Wisp server is not Tor.**
- **Ad blocking is cosmetic only**, hiding a handful of common ad containers. It is not network filtering and doesn't prevent tracking or downloads. A more complete solution requires integrating an audited adblock plugin or server-side filtering with per-session access controls.
- Firefox is not an independent search engine. The option routes search requests to Google, consistent with Firefox's common default search; it is labeled as such in the UI.
- Public web proxies can be abused as an open relay. Add authentication and per-IP/per-user limits before sharing the service. The Wisp backend disables private and loopback IPs to reduce SSRF risk, but no production security audit has been performed.
- Render Free spins down after 15 minutes idle and can take roughly a minute to wake. Free tiers have bandwidth and runtime allowances. Browser rewriting, DRM, login, and CAPTCHAs vary by site. Scramjet/libcurl WebAssembly is heavier than a normal webpage even with this minimal UI.
- Source dependencies include AGPL-licensed transports; check their licenses when distributing or deploying modified versions.
- The brand logo is referenced from the URL supplied in the request. If that host is blocked or drops the file, a styled text fallback appears. For reliability, replace with a licensed local image at `/public/logo.png` and change the URL in `public/app.js`.

## Security guidance

- Put an identity gateway or authentication layer in front of a public deployment.
- Restrict outbound destinations, connections, and bandwidth; the provided Wisp service is not hardened enough for an unauthenticated public proxy.
- Never enable `allow_private_ips` or `allow_loopback_ips` on an internet-facing instance.
- `TOR_WISP_URL` exposes the relay URL to visitors and is *not* an authentication secret.

## Verification

This project was authored without access to npm downloads or a running Render deployment in the build environment. It has **not** been end-to-end installed or browser-tested. Please validate npm resolution, service worker registration, package static paths, and Wisp connections during the first deploy. In particular, upstream package APIs can differ across minor versions.
