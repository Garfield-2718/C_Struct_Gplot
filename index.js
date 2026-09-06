"use strict";
const electron = require("electron");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const child_process = require("child_process");
const icon = path.join(__dirname, "../../resources/icon.png");
const systemTag = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux";
const archTag = process.arch === "arm64" ? "arm64" : "x64";
const platformDir = `${systemTag}-${archTag}`;
const exeName = process.platform === "win32" ? "struct_topology.exe" : "struct_topology";
function resolveCliBinary() {
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, "cli", exeName);
  }
  return path.join(electron.app.getAppPath(), "binaries", platformDir, exeName);
}
const CLI_TIMEOUT_MS = 6e4;
function spawnCli(args) {
  return new Promise((resolve) => {
    child_process.execFile(
      resolveCliBinary(),
      args,
      {
        cwd: electron.app.getPath("userData"),
        maxBuffer: 10 * 1024 * 1024,
        timeout: CLI_TIMEOUT_MS
      },
      (err, stdout, stderr) => {
        if (err) {
          if (err.killed) {
            resolve({
              code: 1,
              stdout: stdout ?? "",
              stderr: `[cli-service] 进程超时（${CLI_TIMEOUT_MS}ms），已终止`
            });
            return;
          }
          const stderrContent = stderr ? stderr : err.message;
          resolve({
            code: typeof err.code === "number" ? err.code : 1,
            stdout: stdout ?? "",
            stderr: stderrContent
          });
          return;
        }
        resolve({ code: 0, stdout: stdout ?? "", stderr: stderr ?? "" });
      }
    );
  });
}
function runInitStub(...args) {
  console.log("[cli-service] runInit stub", resolveCliBinary(), args);
  return { ok: false, message: "runInit not implemented (stub)", cliPath: resolveCliBinary() };
}
function runSvgStub(...args) {
  console.log("[cli-service] runSvg stub", resolveCliBinary(), args);
  return { ok: false, message: "runSvg not implemented (stub)", cliPath: resolveCliBinary() };
}
function registerCliIpc() {
  electron.ipcMain.handle("cli:locate", () => resolveCliBinary());
  electron.ipcMain.handle("cli:init", () => runInitStub());
  electron.ipcMain.handle("cli:svg", () => runSvgStub());
}
if (process.platform === "linux") {
  electron.app.disableHardwareAcceleration();
}
function createWindow() {
  const mainWindow = new electron.BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...process.platform === "linux" ? { icon } : {},
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.ipcMain.handle("select-project-file", async (_event, mode) => {
  let properties = ["openFile"];
  if (mode === "directory") {
    properties = ["openDirectory"];
  } else if (process.platform === "darwin") {
    properties = ["openFile", "openDirectory"];
  }
  const result = await electron.dialog.showOpenDialog({
    properties,
    filters: [{ name: "所有文件", extensions: ["*"] }]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});
electron.ipcMain.handle("process-project-file", async (_event, filePath) => {
  console.log("[Main] 接收到待处理的文件路径:", filePath);
  const trimmed = typeof filePath === "string" ? filePath.trim() : "";
  if (!trimmed) {
    return { status: "failure", filePath, message: "文件路径无效" };
  }
  const result = await spawnCli(["--mode=init", `--input-file=${trimmed}`]);
  if (result.code === 0) {
    return { status: "success", filePath, message: result.stdout || "处理完成" };
  }
  return {
    status: "failure",
    filePath,
    message: result.stderr || `CLI 退出码: ${result.code}`
  };
});
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId("com.electron");
  registerCliIpc();
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  createWindow();
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
