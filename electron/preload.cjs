
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('emxDesktop',{
  available:true,
  getPathForFile(file){
    try { return webUtils.getPathForFile(file) || ''; } catch { return ''; }
  },
  chooseImportFolder(){ return ipcRenderer.invoke('emx:choose-import-folder'); },
  setDefaultImportFolder(folderPath){ return ipcRenderer.invoke('emx:set-default-import-folder',folderPath); },
  getImportLocation(){ return ipcRenderer.invoke('emx:get-import-location'); },
  selectImportMedia(){ return ipcRenderer.invoke('emx:select-import-media'); },
  importFolderMedia(folderPath){ return ipcRenderer.invoke('emx:import-folder-media',folderPath); },
  releaseMediaToken(mediaToken){ return ipcRenderer.invoke('emx:release-media-token',mediaToken); },
  revealInExplorer(filePath){ return ipcRenderer.invoke('emx:reveal-in-explorer',filePath); },
  extractAudio(payload){ return ipcRenderer.invoke('emx:extract-audio',payload); },
  exportProject(payload){ return ipcRenderer.invoke('emx:export-project',payload); },
  healthCheck(){ return ipcRenderer.invoke('emx:health-check'); },
  aiStatus(){ return ipcRenderer.invoke('emx:ai-status'); },
  aiEnsure(payload){ return ipcRenderer.invoke('emx:ai-ensure',payload); },
  aiRepair(payload){ return ipcRenderer.invoke('emx:ai-repair',payload); },
  aiProcess(payload){ return ipcRenderer.invoke('emx:ai-process',payload); },
  updateStatus(){ return ipcRenderer.invoke('emx:update-status'); },
  checkForUpdates(){ return ipcRenderer.invoke('emx:update-check'); },
  downloadUpdate(){ return ipcRenderer.invoke('emx:update-download'); },
  installUpdate(){ return ipcRenderer.invoke('emx:update-install'); },
  onJobEvent(callback){
    const handler=(_event,data)=>callback(data);
    ipcRenderer.on('emx:job-event',handler);
    return ()=>ipcRenderer.removeListener('emx:job-event',handler);
  },
  onUpdateEvent(callback){
    const handler=(_event,data)=>callback(data);
    ipcRenderer.on('emx:update-event',handler);
    return ()=>ipcRenderer.removeListener('emx:update-event',handler);
  }
});
