import { app, BrowserWindow, Tray, Menu, Notification, nativeImage, session } from 'electron';
import path from 'path';
import isOnline from 'is-online';

let tray: Tray | null = null;
let mainWindow: BrowserWindow;
const URL = "https://monkeytype.com/";
const OFFLINE_URL = 'offline.html';

app.setName('MonkeyType Desktop');

app.setAboutPanelOptions({
  applicationName: 'MonkeyType Desktop',
  applicationVersion: '1.0.0',
  copyright: '© 2025 Tachera Sasi',
  credits: 'This is an unofficial wrapper around MonkeyType.\nMade with ❤️ using Electron by Tachera Sasi.',
  website: URL
});

// Create the main browser window
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 992,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false
    },
    icon: path.join(__dirname, '../assets/images/Monkeytype.png'),
    frame: true,
    autoHideMenuBar: true,
    show: false
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const online = await isOnline();

  if (online) {
    mainWindow.loadURL(URL);
  } else {
    mainWindow.loadFile(OFFLINE_URL);
  }
}

// Create the tray icon and menu
function createTray() {
  const trayIcon = nativeImage.createFromPath(
    path.join(__dirname, '../assets/images/Monkeytype.png')
  ).resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show App', click: () => mainWindow.show() },
    { label: 'Quit', click: () => app.quit() }
  ]);

  tray.setToolTip('MonkeyType Desktop');
  tray.setContextMenu(contextMenu);
}

// Schedule a placeholder notification (can be removed/edited later)
function scheduleMorningNotification() {
  if (Notification.isSupported()) {
    new Notification({
      title: 'MonkeyType App',
      body: 'MonkeyType Desktop is running in the background.'
    }).show();
  }
}

// Electron lifecycle
app.whenReady().then(() => {
  createWindow();
  createTray();
  scheduleMorningNotification();

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'notifications') {
      callback(true);
    } else {
      callback(false);
    }
  });

  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36';
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
