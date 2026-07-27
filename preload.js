const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // تخزين البيانات
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),

  // إدارة ملفات الدعاوى
  openCaseFiles: (caseId, c) => ipcRenderer.invoke('open-case-files', caseId, c),
  listCaseFiles: (caseId, c) => ipcRenderer.invoke('list-case-files', caseId, c),
  uploadCaseFile: (caseId, documentType, path, c) => ipcRenderer.invoke('upload-case-file', caseId, documentType, path, c),
  openCaseFile: (caseId, documentType, fileName, c) => ipcRenderer.invoke('open-case-file', caseId, documentType, fileName, c),
  deleteCaseFile: (caseId, documentType, fileName, c) => ipcRenderer.invoke('delete-case-file', caseId, documentType, fileName, c),

  // التحديث التلقائي
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (event, status) => cb(status)),
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (event, info) => cb(info)),
  onUpdateProgress: (cb) => ipcRenderer.on('update-progress', (event, progress) => cb(progress)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (event, info) => cb(info)),
  onUpdateError: (cb) => ipcRenderer.on('update-error', (event, err) => cb(err)),
});
