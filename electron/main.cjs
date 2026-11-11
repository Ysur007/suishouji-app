/**
 * Electron 主进程：在本地起一个完整的「随手记」服务（内置 Node 服务端 + 静态资源），
 * 然后用窗口加载 http://127.0.0.1:8787，和浏览器里跑的是同一套代码。
 * 数据存在系统的 userData 目录，卸载重装不会丢。
 */
const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('node:path');
const http = require('node:http');

const PORT = Number(process.env.SSJ_PORT || 8787);
const ROOT = app.getAppPath();
/** SSJ_REMOTE=https://your-server 时直接当客户端用，不起本地服务 */
const REMOTE = (process.env.SSJ_REMOTE || '').trim();
let win = null;
let serverStarted = false;

function startServer() {
  if (serverStarted) return;
  serverStarted = true;

  process.env.APP_ROOT = ROOT;
  process.env.DATA_DIR = path.join(app.getPath('userData'), 'data');
  process.env.PORT = String(PORT);

  try {
    require(path.join(ROOT, 'dist-server', 'server.cjs'));
  } catch (err) {
    dialog.showErrorBox('随手记启动失败', `内置服务没能启动：\n${err && err.stack ? err.stack : err}`);
    app.quit();
  }
}

function waitForServer(onReady, tries = 60) {
  const req = http.get({ host: '127.0.0.1', port: PORT, path: '/api/health', timeout: 800 }, (res) => {
    res.resume();
    onReady();
  });
  req.on('error', () => {
    if (tries <= 0) return onReady();
    setTimeout(() => waitForServer(onReady, tries - 1), 200);
  });
  req.on('timeout', () => req.destroy());
}

function createWindow(url) {
  win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 880,
    minHeight: 560,
    title: '随手记',
    backgroundColor: '#f2f2f2',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadURL(url);
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(() => {
  if (REMOTE) {
    createWindow(REMOTE);
  } else {
    startServer();
    waitForServer(() => createWindow(`http://127.0.0.1:${PORT}`));
  }
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) {
      createWindow(REMOTE || `http://127.0.0.1:${PORT}`);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
