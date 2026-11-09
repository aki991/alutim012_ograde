'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  onUpdateDownloaded: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('update:downloaded', handler);
    return () => ipcRenderer.removeListener('update:downloaded', handler);
  },
  // ažuriranje je već preuzeto: restartuje aplikaciju i instalira ga
  installUpdate: () => ipcRenderer.invoke('update:install'),
  // verzija koja je preuzeta pre nego što se stranica učitala (ako postoji)
  getPendingUpdate: () => ipcRenderer.invoke('update:pending'),
});
