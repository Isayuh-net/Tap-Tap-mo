// Electron main process for a gate station: opens the gate window, saves every tap
// to the outbox, and syncs with the server in the background.
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const config = require('./config');
const outbox = require('./outbox');
const roster = require('./roster');
const sync = require('./sync');

// Only one copy may run, so two windows never compete for the reader's input.
if (!app.requestSingleInstanceLock()) app.quit();

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    kiosk: config.kiosk,
    autoHideMenuBar: true,
    backgroundColor: '#222222',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      autoplayPolicy: 'no-user-gesture-required', // beep without clicking the screen first
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('gate:info', () => ({ gateName: config.gateName }));

// A card was tapped: save it first, then try to send it to the server right away.
ipcMain.handle('gate:tap', async (_event, rawUid) => {
  const uid = String(rawUid).replace(/\s+/g, '').toUpperCase(); // same cleanup as the server
  const tap = outbox.add(uid);
  const results = await sync.uploadNow().catch(() => null);
  const result = results?.find((r) => r.clientTapId === tap.clientTapId);
  if (result) return { online: true, ...result };
  // Server not reachable: the tap stays in the outbox and is sent later.
  return { online: false, student: roster.lookup(uid) };
});

app.whenReady().then(() => {
  // Start automatically when Windows starts (installed app only).
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });
  createWindow();
  sync.start();
});

app.on('window-all-closed', () => app.quit());
