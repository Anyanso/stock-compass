// Exposes a small, fixed set of desktop features to the Stock Compass page.
// The page never receives API keys; it can only ask the main process to use them.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("scDesktop", {
  version: ipcRenderer.sendSync("sc:version"),
  hasKey: name => ipcRenderer.invoke("sc:hasKey", name),
  setKey: (name, value) => ipcRenderer.invoke("sc:setKey", name, value),
  quote: symbol => ipcRenderer.invoke("sc:quote", symbol),
  ai: prompt => ipcRenderer.invoke("sc:ai", prompt),
  questradeConnect: token => ipcRenderer.invoke("sc:qtConnect", token),
  questradeSync: () => ipcRenderer.invoke("sc:qtSync"),
  questradeStatus: () => ipcRenderer.invoke("sc:qtStatus"),
  questradeDisconnect: () => ipcRenderer.invoke("sc:qtDisconnect"),
  openExternal: url => ipcRenderer.invoke("sc:openExternal", url),
  clearAll: () => ipcRenderer.invoke("sc:clearAll")
});
