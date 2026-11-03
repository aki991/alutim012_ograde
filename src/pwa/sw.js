/* Service worker za instaliranu (desktop) aplikaciju. Spisak fajlova PRECACHE i VERSION ubacuje build (vite.config.ts). */
/* global PRECACHE, VERSION */
const CACHE = `alutim-${VERSION}`;

// instalacija: unapred čuva celu aplikaciju (i delove koji se učitavaju naknadno: 3D, PDF), da radi bez interneta
self.addEventListener('install', (event) => {
  // skipWaiting: nova verzija se aktivira odmah, bez čekanja da se zatvore svi prozori stare (inače ostaju stare ikonice i fajlovi)
  event.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(PRECACHE.map((url) => c.add(url).catch(() => undefined)))).then(() => self.skipWaiting()),
  );
});

// aktivacija: briše keš starih verzija; nova verzija preuzima tek kad se zatvore svi prozori stare
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('alutim-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // samo GET zahtevi ka samoj aplikaciji; Supabase i ostali spoljni servisi idu direktno na mrežu
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // serverske funkcije (spisak korisnika i slično) uvek idu na mrežu, nikad iz keša
  if (url.pathname.startsWith('/api/')) return;

  // manifest i ikonice imaju stalna imena (bez heša), pa uvek prvo mreža: izmena logotipa mora odmah da se vidi pri instalaciji
  if (url.pathname === '/manifest.webmanifest' || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/favicon')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); void caches.open(CACHE).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req, { ignoreVary: true }).then((r) => r ?? Response.error())),
    );
    return;
  }

  if (req.mode === 'navigate') {
    // stranice: prvo mreža (uvek najnovija verzija kad ima interneta), bez mreže sačuvana aplikacija
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); void caches.open(CACHE).then((c) => c.put('/index.html', copy)); }
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r ?? Response.error())),
    );
    return;
  }

  // fajlovi aplikacije (imena sa heš oznakom se ne menjaju): prvo keš, pa mreža
  // ignoreVary: server šalje „Vary: Origin", a JS moduli se traže sa zaglavljem Origin koje sačuvani zahtev nema
  event.respondWith(
    caches.match(req, { ignoreVary: true }).then((hit) => hit ?? fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); void caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })),
  );
});
