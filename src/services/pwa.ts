/** Registruje service worker (samo u produkcijskom buildu), da se aplikacija može instalirati kao desktop aplikacija i radi bez interneta. */
export function registerServiceWorker(): void {
  // u desktop (Electron) aplikaciji fajlove servira sam program, pa service worker nije potreban
  if (window.electronAPI || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
