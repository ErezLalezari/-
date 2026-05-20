// Minimal service worker so the app meets PWA install criteria.
// No caching — we want Liya to always get the freshest deploy. The only
// reason this file exists is that Chrome/Edge require a SW with a fetch
// handler before they show the "Add to home screen" prompt.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => { /* network-only, no caching */ });
