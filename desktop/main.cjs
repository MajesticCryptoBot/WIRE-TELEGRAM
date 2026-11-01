/**
 * WIRE Desktop – Electron Main Process
 * ====================================
 * Starts the local Bot API server and opens the UI in a native window.
 */

const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const PORT = 8787;
const HOST = "127.0.0.1";
let mainWindow = null;
let serverProcess = null;

function waitForServer(maxAttempts = 40) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get(`http://${HOST}:${PORT}/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else if (attempts < maxAttempts) {
          setTimeout(check, 250);
        } else {
          reject(new Error("Server did not become ready"));
        }
      });
      req.on("error", () => {
        if (attempts < maxAttempts) setTimeout(check, 250);
        else reject(new Error("Server did not become ready"));
      });
    };
    check();
  });
}

function startServer() {
  const serverPath = path.join(__dirname, "..", "src", "server.js");
  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });

  serverProcess.on("error", (err) => {
    console.error("[WIRE] Failed to start server:", err);
  });

  serverProcess.on("exit", (code) => {
    console.log(`[WIRE] Server exited with code ${code}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    title: "WIRE",
    backgroundColor: "#0e0e10",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    show: false,
  });

  mainWindow.loadURL(`http://${HOST}:${PORT}`);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  startServer();

  try {
    await waitForServer();
    createWindow();
  } catch (err) {
    console.error("[WIRE] Could not start:", err.message);
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
