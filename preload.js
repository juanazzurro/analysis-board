const { contextBridge, ipcRenderer } = require("electron");

const lineListeners = new Set();
const exitListeners = new Set();
ipcRenderer.on("engine:line", (_e, id, line) => { for (const f of lineListeners) f(id, line); });
ipcRenderer.on("engine:exit", (_e, id, code) => { for (const f of exitListeners) f(id, code); });

contextBridge.exposeInMainWorld("api", {
  engineStart: (id) => ipcRenderer.invoke("engine:start", id),
  engineSend: (id, cmd) => ipcRenderer.send("engine:send", id, cmd),
  engineStop: (id) => ipcRenderer.invoke("engine:stop", id),
  onEngineLine: (f) => { lineListeners.add(f); return () => lineListeners.delete(f); },
  onEngineExit: (f) => { exitListeners.add(f); return () => exitListeners.delete(f); },
  sysInfo: () => ipcRenderer.invoke("sys:info"),
  storeGet: (k) => ipcRenderer.invoke("store:get", k),
  storeSet: (k, v) => ipcRenderer.invoke("store:set", k, v),
  storePath: () => ipcRenderer.invoke("store:path"),
  importGames: (source, user, max) => ipcRenderer.invoke("import:games", source, user, max),
  aiAsk: (opts) => ipcRenderer.invoke("ai:ask", opts),
  openExternal: (url) => ipcRenderer.invoke("shell:open", url),
  log: (...a) => ipcRenderer.send("log", ...a),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  checkUpdate: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  onUpdateProgress: (f) => { const h = (_e, p) => f(p); ipcRenderer.on("update:progress", h); return () => ipcRenderer.removeListener("update:progress", h); },
  copyText: (t) => ipcRenderer.invoke("clip:write", t),
  saveFile: (o) => ipcRenderer.invoke("file:save", o),
  openFile: (kind) => ipcRenderer.invoke("file:open", kind),
  pendingFiles: () => ipcRenderer.invoke("file:pending"),
  onFileOpened: (f) => { ipcRenderer.on("file:opened", (_e, x) => f(x)); },
  onMenu: (f) => { ipcRenderer.on("menu", (_e, c) => f(c)); },
  setTheme: (t) => ipcRenderer.invoke("theme:set", t),
  reload: () => ipcRenderer.invoke("lang:set", null),
  setLang: (lang) => ipcRenderer.invoke("lang:set", lang),
  puzzlesLoad: () => ipcRenderer.invoke("puzzles:load"),
  puzzlesDownload: () => ipcRenderer.invoke("puzzles:download"),
  onPuzzlesProgress: (f) => { const h = (_e, p) => f(p); ipcRenderer.on("puzzles:progress", h); return () => ipcRenderer.removeListener("puzzles:progress", h); }
});
