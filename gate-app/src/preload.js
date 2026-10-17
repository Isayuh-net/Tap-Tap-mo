// Bridge between the gate screen and the main process. The screen can only call these functions.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gate', {
  info: () => ipcRenderer.invoke('gate:info'),
  tap: (uid) => ipcRenderer.invoke('gate:tap', uid),
});
