// The page's one way into the desktop program: print on paper of an exact size (see ay:print in main.cjs).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ayDesktop', {
  print: (page) => ipcRenderer.invoke('ay:print', page),
});
