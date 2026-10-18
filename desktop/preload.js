const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
    isElectron: true,
    platform: process.platform,
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
    getServerPort: () => ipcRenderer.invoke('get-server-port')
});
