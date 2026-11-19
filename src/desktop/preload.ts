import { contextBridge, ipcRenderer } from "electron";

// The renderer's single, narrow door to the host.
contextBridge.exposeInMainWorld("phloHost", {
  platform: process.platform,
  invoke: (method: string, args: unknown[]) => ipcRenderer.invoke("phlo", method, args),
});
