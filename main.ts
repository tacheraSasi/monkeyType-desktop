import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  Notification,
  nativeImage,
  session,
} from "electron";
import path from "path";
import isOnline from "is-online";

let tray: Tray | null = null;
let mainWindow: BrowserWindow;
const URL = "https://monkeytype.com/";
const OFFLINE_URL = "offline.html";

app.setName("MonkeyType Desktop");

app.setAboutPanelOptions({
  applicationName: "MonkeyType Desktop",
  applicationVersion: "1.0.0",
  copyright: "© 2025 Tachera Sasi",
  credits:
    "This is an unofficial wrapper around MonkeyType.\nMade with ❤️ using Electron by Tachera Sasi.",
  website: URL,
});

// Stable rendering defaults for Linux/Wayland, applied *before* app is ready.
// Verified on Hyprland/wlroots: the GPU path segfaults the GPU process
// (exit 139) under XWayland and fails GBM buffer creation under native
// Wayland, leaving no mapped surface. Native Wayland + software rendering
// presents cleanly via wl_shm, and monkeytype.com is light DOM so software
// rendering is plenty fast.
// Overrides:
//   MONKEYTYPE_OZONE_HINT=x11  -> force XWayland instead of native Wayland
//   MONKEYTYPE_ENABLE_GPU=1    -> opt back into hardware acceleration
if (process.platform === "linux") {
  const ozoneHint = process.env.MONKEYTYPE_OZONE_HINT ?? "auto";
  if (ozoneHint === "x11") {
    app.commandLine.appendSwitch("ozone-platform", "x11");
  } else {
    app.commandLine.appendSwitch("ozone-platform-hint", ozoneHint);
  }
  if (!process.env.MONKEYTYPE_ENABLE_GPU) {
    app.commandLine.appendSwitch("disable-gpu");
  }
}

// `is-online` probes the network and can hang on captive portals / dead
// DNS. Don't let it block the first load (and therefore first paint) forever.
async function checkOnlineWithTimeout(timeoutMs = 5000): Promise<boolean> {
  try {
    return await Promise.race([
      isOnline(),
      new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(true), timeoutMs),
      ),
    ]);
  } catch {
    return true;
  }
}

// Create the main browser window
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 992,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      sandbox: false,
    },
    icon: path.join(__dirname, "../assets/images/monkeytype.png"),
    frame: true,
    autoHideMenuBar: true,
    show: false,
  });

  let shown = false;
  let fallbackTimer: NodeJS.Timeout | undefined;
  const showOnce = () => {
    if (shown) return;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    shown = true;
    if (fallbackTimer) clearTimeout(fallbackTimer);
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
  };

  mainWindow.once("ready-to-show", showOnce);

  // Fallback: force-show even if `ready-to-show` never fires (e.g. first
  // paint fails/races under Wayland, or load stalls).
  fallbackTimer = setTimeout(showOnce, 3000);
  mainWindow.once("closed", () => {
    if (fallbackTimer) clearTimeout(fallbackTimer);
  });

  // If the online load fails, fall back to the bundled offline page instead
  // of leaving a blank hidden window.
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, _code, _desc, validatedURL, isMainFrame) => {
      if (
        isMainFrame &&
        !validatedURL.endsWith(OFFLINE_URL) &&
        mainWindow &&
        !mainWindow.isDestroyed()
      ) {
        void mainWindow.loadFile(OFFLINE_URL).then(showOnce);
      }
    },
  );

  const online = await checkOnlineWithTimeout();

  if (online) {
    mainWindow.loadURL(URL).catch(showOnce);
  } else {
    mainWindow.loadFile(OFFLINE_URL).then(showOnce, showOnce);
  }
}

// Create the tray icon and menu
function createTray() {
  const trayIcon = nativeImage
    .createFromPath(path.join(__dirname, "../assets/images/monkeytype.png"))
    .resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show App",
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
        }
      },
    },
    { label: "Quit", click: () => app.quit() },
  ]);

  tray.setToolTip("MonkeyType Desktop");
  tray.setContextMenu(contextMenu);
}

// Schedule a placeholder notification (can be removed/edited later)
function scheduleMorningNotification() {
  if (Notification.isSupported()) {
    new Notification({
      title: "MonkeyType App",
      body: "MonkeyType Desktop is running in the background.",
    }).show();
  }
}

// Electron lifecycle
app.whenReady().then(() => {
  createWindow();
  createTray();
  scheduleMorningNotification();

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      if (permission === "notifications") {
        callback(true);
      } else {
        callback(false);
      }
    }
  );

  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders["User-Agent"] =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36";
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
