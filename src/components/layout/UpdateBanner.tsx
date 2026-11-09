import { useEffect, useState } from 'react';

/** Neupadljiv baner u desktop (Electron) aplikaciji: nova verzija je preuzeta u pozadini. U web verziji se ne prikazuje. */
export function UpdateBanner() {
  const api = window.electronAPI;
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!api) return;
    void api.getPendingUpdate().then((u) => { if (u) setVersion(u.version); });
    return api.onUpdateDownloaded((u) => setVersion(u.version));
  }, [api]);

  if (!api || !version) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[200] card p-4 shadow-2xl max-w-sm" role="status" data-testid="update-banner">
      <div className="text-sm font-semibold mb-3">Dostupna je nova verzija {version}</div>
      <div className="flex gap-2">
        <button className="btn btn-primary" data-testid="update-install" onClick={() => void api.installUpdate()}>Restartuj i ažuriraj</button>
        <button className="btn" data-testid="update-later" onClick={() => setVersion(null)}>Kasnije</button>
      </div>
    </div>
  );
}
