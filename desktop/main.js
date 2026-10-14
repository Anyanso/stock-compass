// Stock Compass desktop: main process.
// The window shows the same Stock Compass page as the website. Anything private
// (API keys, the Questrade connection, Claude requests) happens here, never in the page.
const { app, BrowserWindow, ipcMain, shell, safeStorage, Menu, nativeTheme } = require("electron");
const path = require("path");
const fs = require("fs");

const ALLOWED_HOSTS = [/^finnhub\.io$/, /^www\.alphavantage\.co$/, /^api\.anthropic\.com$/, /^login\.questrade\.com$/, /^api\d*\.iq\.questrade\.com$/];
const AI_MODEL = "claude-sonnet-5-5";

// ---------- Secure storage: values are encrypted with the operating system's keychain ----------
const secretsFile = () => path.join(app.getPath("userData"), "secrets.json");
const metaFile = () => path.join(app.getPath("userData"), "questrade.json");
function readJSON(f) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return {}; } }
function writeJSON(f, o) { fs.writeFileSync(f, JSON.stringify(o), { mode: 0o600 }); }
function getSecret(name) {
  const s = readJSON(secretsFile())[name];
  if (!s) return "";
  try { return safeStorage.decryptString(Buffer.from(s, "base64")); } catch { return ""; }
}
function setSecret(name, value) {
  const all = readJSON(secretsFile());
  if (!value) delete all[name];
  else {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Secure storage isn't available on this computer.");
    all[name] = safeStorage.encryptString(value).toString("base64");
  }
  writeJSON(secretsFile(), all);
}
const KEY_NAMES = new Set(["finnhub", "alphavantage", "anthropic"]);
// Developer testing only: Linux machines without a keychain can opt in to weak local encryption.
if (process.platform === "linux" && process.env.SC_DEV_PLAINTEXT === "1") safeStorage.setUsePlainTextEncryption(true);

// ---------- Network: only the services Stock Compass uses ----------
async function request(url, opts = {}) {
  const u = new URL(url);
  if (u.protocol !== "https:" || !ALLOWED_HOSTS.some(rx => rx.test(u.hostname))) throw new Error("Blocked host");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeout || 30000);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

// ---------- Live prices ----------
async function quote(symbol) {
  if (!/^[A-Za-z0-9.\-]{1,15}$/.test(symbol)) return { error: "nodata" };
  const fh = getSecret("finnhub"), av = getSecret("alphavantage");
  try {
    if (fh) {
      const r = await request(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(fh)}`);
      if (r.status === 401 || r.status === 403) return { error: "badkey" };
      if (r.status === 429) { if (!av) return { error: "limit" }; }
      else if (r.ok) {
        const j = await r.json();
        if (j && j.c > 0) return { price: j.c, changePct: j.dp || 0, day: j.t ? new Date(j.t * 1000).toISOString().slice(0, 10) : "" };
        if (!av) return { error: "nodata" };
      }
    }
    if (av) {
      const r = await request(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(av)}`);
      if (!r.ok) return { error: "nodata" };
      const j = await r.json();
      const g = j["Global Quote"];
      if (g && g["05. price"]) return { price: +g["05. price"], changePct: parseFloat(g["10. change percent"]) || 0, day: g["07. latest trading day"] || "" };
      const info = j.Information || j.Note || "";
      if (info) return { error: /api ?key/i.test(info) && !/rate limit|requests per day/i.test(info) ? "badkey" : "limit" };
      return { error: "nodata" };
    }
    return { error: "nokey" };
  } catch { return { error: "network" }; }
}

// ---------- Claude (Anthropic API) ----------
async function ai(prompt) {
  const key = getSecret("anthropic");
  if (!key) return { error: "nokey", message: "Add your Anthropic API key in Settings to turn on AI write-ups." };
  if (typeof prompt !== "string" || prompt.length > 8000) return { error: "bad", message: "That request was too long." };
  try {
    const r = await request("https://api.anthropic.com/v1/messages", {
      method: "POST", timeout: 90000,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 1200, messages: [{ role: "user", content: prompt }] })
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) return { error: "badkey", message: "Anthropic didn't accept your API key. Check it in Settings." };
    if (r.status === 429) return { error: "rate_limited", message: "Too many requests just now. Try again in a minute." };
    if (!r.ok) return { error: "api", message: (j.error && j.error.message) ? `Anthropic: ${j.error.message}` : "Couldn't write the analysis. Try again." };
    const text = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    return { text: text || "No analysis was returned. Try again." };
  } catch { return { error: "network", message: "Couldn't reach Anthropic. Check your internet connection." }; }
}

// ---------- Questrade (read-only) ----------
let qtAccess = null; // { token, api, expires }
async function qtRefresh(refreshToken) {
  const r = await request(`https://login.questrade.com/oauth2/token?grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`);
  if (!r.ok) throw Object.assign(new Error("Questrade didn't accept the token. In Questrade, generate a new token and connect again."), { auth: true });
  const j = await r.json();
  setSecret("questrade_refresh", j.refresh_token); // Questrade refresh tokens work once, so keep the new one
  qtAccess = { token: j.access_token, api: j.api_server, expires: Date.now() + (j.expires_in - 60) * 1000 };
  return qtAccess;
}
async function qtGet(p) {
  if (!qtAccess || Date.now() > qtAccess.expires) {
    const rt = getSecret("questrade_refresh");
    if (!rt) throw Object.assign(new Error("Questrade isn't connected."), { auth: true });
    await qtRefresh(rt);
  }
  const r = await request(qtAccess.api + p, { headers: { Authorization: "Bearer " + qtAccess.token } });
  if (r.status === 401) { qtAccess = null; throw Object.assign(new Error("Your Questrade connection expired. Generate a new token in Questrade and connect again."), { auth: true }); }
  if (!r.ok) throw new Error("Questrade returned an error. Try again in a moment.");
  return r.json();
}
async function qtConnect(token) {
  try {
    if (typeof token !== "string" || token.length < 10) return { ok: false, message: "Paste the token from Questrade first." };
    await qtRefresh(token.trim());
    const a = await qtGet("v1/accounts");
    writeJSON(metaFile(), { accounts: (a.accounts || []).length, lastSync: null });
    return { ok: true };
  } catch (e) { return { ok: false, message: e.auth ? e.message : "Couldn't reach Questrade. Check your internet connection and try again." }; }
}
async function qtSync() {
  try {
    const { accounts = [] } = await qtGet("v1/accounts");
    const rows = [];
    for (const acc of accounts) {
      const { positions = [] } = await qtGet(`v1/accounts/${encodeURIComponent(acc.number)}/positions`);
      for (const p of positions) rows.push({ ...p, accountType: acc.type });
    }
    const ids = [...new Set(rows.map(r => r.symbolId).filter(Boolean))];
    const info = {};
    for (let i = 0; i < ids.length; i += 50) {
      const { symbols = [] } = await qtGet(`v1/symbols?ids=${ids.slice(i, i + 50).join(",")}`);
      symbols.forEach(s => { info[s.symbolId] = s; });
    }
    const positions = rows.map(r => ({
      symbol: r.symbol, name: info[r.symbolId]?.description || r.symbol, currency: info[r.symbolId]?.currency || "CAD",
      exchange: info[r.symbolId]?.listingExchange || "", quantity: r.openQuantity, currentPrice: r.currentPrice,
      averageEntryPrice: r.averageEntryPrice, accountType: r.accountType
    }));
    writeJSON(metaFile(), { accounts: accounts.length, lastSync: new Date().toISOString() });
    return { ok: true, positions };
  } catch (e) {
    if (e.auth) { setSecret("questrade_refresh", ""); qtAccess = null; }
    return { ok: false, message: e.auth ? e.message : "Couldn't reach Questrade. Check your internet connection and try again." };
  }
}
function qtStatus() {
  const meta = readJSON(metaFile());
  return { connected: !!getSecret("questrade_refresh"), accounts: meta.accounts || 0, lastSync: meta.lastSync || null };
}

// ---------- IPC: the only things the page can ask for ----------
ipcMain.on("sc:version", e => { e.returnValue = app.getVersion(); });
ipcMain.handle("sc:hasKey", (_e, name) => KEY_NAMES.has(name) && !!getSecret(name));
ipcMain.handle("sc:setKey", (_e, name, value) => {
  if (!KEY_NAMES.has(name)) return false;
  if (value && (typeof value !== "string" || value.length > 300)) return false;
  setSecret(name, value || ""); return true;
});
ipcMain.handle("sc:quote", (_e, symbol) => quote(String(symbol || "")));
ipcMain.handle("sc:ai", (_e, prompt) => ai(prompt));
ipcMain.handle("sc:qtConnect", (_e, token) => qtConnect(token));
ipcMain.handle("sc:qtSync", () => qtSync());
ipcMain.handle("sc:qtStatus", () => qtStatus());
ipcMain.handle("sc:qtDisconnect", () => { setSecret("questrade_refresh", ""); qtAccess = null; try { fs.unlinkSync(metaFile()); } catch {} return true; });
ipcMain.handle("sc:openExternal", (_e, url) => { try { const u = new URL(url); if (u.protocol === "https:") shell.openExternal(u.toString()); } catch {} });
ipcMain.handle("sc:clearAll", async () => {
  try { fs.unlinkSync(secretsFile()); } catch {}
  try { fs.unlinkSync(metaFile()); } catch {}
  qtAccess = null;
  const w = BrowserWindow.getAllWindows()[0];
  if (w) await w.webContents.session.clearStorageData();
  return true;
});

// ---------- Window ----------
function createWindow() {
  const win = new BrowserWindow({
    width: 1300, height: 880, minWidth: 420, minHeight: 600,
    title: "Stock Compass",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0C1416" : "#EEF2F2",
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
  });
  win.once("ready-to-show", () => win.show());
  // Links open in the user's normal browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file://")) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  win.loadFile(path.join(__dirname, "app", "index.html"));
}

const isMac = process.platform === "darwin";
Menu.setApplicationMenu(Menu.buildFromTemplate([
  ...(isMac ? [{ role: "appMenu" }] : []),
  { label: "File", submenu: [isMac ? { role: "close" } : { role: "quit" }] },
  { role: "editMenu" },
  { label: "View", submenu: [{ role: "reload" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
  { role: "windowMenu" },
  { role: "help", submenu: [{ label: "Stock Compass on GitHub", click: () => shell.openExternal("https://github.com/Anyanso/stock-compass") }] }
]));

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
  app.whenReady().then(() => {
    createWindow();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on("window-all-closed", () => { if (!isMac) app.quit(); });
}
