/** Most ka Electron glavnom procesu (preload). Postoji samo u desktop aplikaciji. */
export interface ElectronAPI {
  isElectron: true;
  getVersion(): Promise<string>;
  onUpdateDownloaded(callback: (info: { version: string }) => void): () => void;
  installUpdate(): Promise<void>;
  getPendingUpdate(): Promise<{ version: string } | null>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
