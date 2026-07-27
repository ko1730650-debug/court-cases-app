const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// ---------- إعداد اللوج (يفيد جدًا لتتبع مشاكل التحديث) ----------
log.transports.file.level = 'info';
autoUpdater.logger = log;
autoUpdater.autoDownload = false; // التحميل يبدأ فقط لما المستخدم يدوس "تنزيل التحديث"
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow;

// ---------- مسارات التخزين ----------
function getDataFilePath() {
  return path.join(app.getPath('userData'), 'data.json');
}
function getCaseFilesRoot() {
  const dir = path.join(app.getPath('userData'), 'CaseFiles');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function sanitizeName(name) {
  return String(name || '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'بدون_اسم';
}
function getCaseFolder(caseId, c) {
  const folderName = sanitizeName(`${c?.plaintiff || ''}_${c?.caseNumber || caseId}`);
  const folder = path.join(getCaseFilesRoot(), folderName);
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  return folder;
}
const DOC_TYPES = ['صحيفة_الدعوى', 'مستندات_الخصم', 'مستندات_الدولة', 'مذكرة_دفاع_الدولة', 'الحكم_الصادر'];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ============ تخزين البيانات (ملف JSON محلي بدل localStorage) ============
ipcMain.handle('load-data', async () => {
  try {
    const file = getDataFilePath();
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    log.error('load-data error', e);
    return null;
  }
});

ipcMain.handle('save-data', async (event, data) => {
  try {
    fs.writeFileSync(getDataFilePath(), JSON.stringify(data), 'utf-8');
    return { success: true };
  } catch (e) {
    log.error('save-data error', e);
    return { success: false, error: e.message };
  }
});

// ============ إدارة ملفات الدعاوى ============
ipcMain.handle('open-case-files', async (event, caseId, c) => {
  try {
    const folder = getCaseFolder(caseId, c);
    DOC_TYPES.forEach((t) => {
      const sub = path.join(folder, t);
      if (!fs.existsSync(sub)) fs.mkdirSync(sub, { recursive: true });
    });
    await shell.openPath(folder);
    return { success: true, folder };
  } catch (e) {
    log.error('open-case-files error', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('list-case-files', async (event, caseId, c) => {
  try {
    const folder = getCaseFolder(caseId, c);
    const files = {};
    DOC_TYPES.forEach((t) => {
      const sub = path.join(folder, t);
      files[t] = fs.existsSync(sub) ? fs.readdirSync(sub).filter((f) => !f.startsWith('.')) : [];
    });
    return { success: true, files };
  } catch (e) {
    log.error('list-case-files error', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('upload-case-file', async (event, caseId, documentType, _unused, c) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'اختر الملف المراد رفعه',
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) {
      return { success: false, error: 'تم الإلغاء' };
    }
    const srcPath = result.filePaths[0];
    const folder = getCaseFolder(caseId, c);
    const destDir = path.join(folder, documentType);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const fileName = path.basename(srcPath);
    const destPath = path.join(destDir, fileName);
    fs.copyFileSync(srcPath, destPath);
    return { success: true, fileName };
  } catch (e) {
    log.error('upload-case-file error', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('open-case-file', async (event, caseId, documentType, fileName, c) => {
  try {
    const folder = getCaseFolder(caseId, c);
    const filePath = path.join(folder, documentType, fileName);
    const err = await shell.openPath(filePath);
    if (err) return { success: false, error: err };
    return { success: true };
  } catch (e) {
    log.error('open-case-file error', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('delete-case-file', async (event, caseId, documentType, fileName, c) => {
  try {
    const folder = getCaseFolder(caseId, c);
    const filePath = path.join(folder, documentType, fileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { success: true };
  } catch (e) {
    log.error('delete-case-file error', e);
    return { success: false, error: e.message };
  }
});

// ============ التحديث الذكي عبر GitHub Releases ============
function send(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

autoUpdater.on('checking-for-update', () => send('update-status', 'checking'));
autoUpdater.on('update-not-available', () => send('update-status', 'not-available'));
autoUpdater.on('update-available', (info) => send('update-available', info));
autoUpdater.on('download-progress', (progress) => send('update-progress', progress));
autoUpdater.on('update-downloaded', (info) => send('update-downloaded', info));
autoUpdater.on('error', (err) => send('update-error', err == null ? 'خطأ غير معروف' : err.message));

ipcMain.handle('check-for-updates', async () => {
  try {
    await autoUpdater.checkForUpdates();
    return { success: true };
  } catch (e) {
    log.error('checkForUpdates error', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (e) {
    log.error('downloadUpdate error', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('install-update', async () => {
  try {
    autoUpdater.quitAndInstall();
    return { success: true };
  } catch (e) {
    log.error('installUpdate error', e);
    return { success: false, error: e.message };
  }
});
