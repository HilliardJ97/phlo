/**
 * Phlo desktop shell (Electron).
 *
 * The host (storage, model calls, keys) runs in this main process. The
 * renderer is sandboxed and context-isolated; it can only call the allow-listed
 * HostApi methods through one IPC channel. Keys are encrypted with the OS
 * keychain (safeStorage) and never reach the renderer.
 */
import { app, BrowserWindow, ipcMain, nativeTheme, safeStorage, session, shell } from "electron";
import * as path from "node:path";
import { HOST_METHODS, HostApi, memoryCipher, type Cipher, type HostMethod } from "../host/api";
import { SupersededError } from "../host/ai/orchestrator";
import { VersionConflictError } from "../host/store";

const keychain: Cipher = {
  get secure() {
    return safeStorage.isEncryptionAvailable();
  },
  encrypt: (s) => safeStorage.encryptString(s).toString("base64"),
  decrypt: (s) => safeStorage.decryptString(Buffer.from(s, "base64")),
};

let api: HostApi;

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 520,
    title: "Phlo",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#121316" : "#f7f7f4",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 20, y: 20 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  win.once("ready-to-show", () => win.show());
  // Links open in the browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  await win.loadFile(path.join(__dirname, "../renderer/index.html"));
  return win;
}

app.whenReady().then(async () => {
  const dataDir = process.env.PHLO_DATA_DIR ?? path.join(app.getPath("userData"), "data");
  api = await new HostApi(dataDir, safeStorage.isEncryptionAvailable() ? keychain : memoryCipher).init();

  // Microphone only; deny everything else.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === "media"));

  ipcMain.handle("phlo", async (_e, method: string, args: unknown[]) => {
    if (!HOST_METHODS.includes(method as HostMethod)) return { ok: false, code: "UNKNOWN_METHOD" };
    try {
      const fn = api[method as HostMethod] as (...a: unknown[]) => unknown;
      const result = await fn.apply(api, Array.isArray(args) ? args : []);
      return { ok: true, result: result ?? null };
    } catch (e) {
      if (e instanceof SupersededError) return { ok: false, code: "SUPERSEDED" };
      if (e instanceof VersionConflictError) return { ok: false, code: "VERSION_CONFLICT", message: e.message };
      return { ok: false, code: "ERROR", message: e instanceof Error ? e.message : String(e) };
    }
  });

  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("before-quit", () => api?.dispose());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
