
const { app, BrowserWindow, shell, ipcMain, dialog, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { exportProject, extractAudio, versionLine } = require('./exporter.cjs');
const { setupAudioAI, aiStatus, processAudioAI } = require('./audio-ai.cjs');
const { cliReady } = require('./ai-runtime.cjs');
const { normalizeWatermark, watermarkAssetPath } = require('./branding.cjs');
const { EmxUpdateService } = require('./updater.cjs');

let mainWindow;
let updateService;
let defaultImportFolder='';
const mediaTokens=new Map();
const mediaExtensions=new Map([
  ['.mp4','video/mp4'],['.m4v','video/mp4'],['.mov','video/quicktime'],['.mkv','video/x-matroska'],
  ['.avi','video/x-msvideo'],['.webm','video/webm'],['.wmv','video/x-ms-wmv'],
  ['.mp3','audio/mpeg'],['.wav','audio/wav'],['.m4a','audio/mp4'],['.aac','audio/aac'],
  ['.flac','audio/flac'],['.ogg','audio/ogg'],['.opus','audio/ogg'],
  ['.png','image/png'],['.jpg','image/jpeg'],['.jpeg','image/jpeg'],['.webp','image/webp'],['.gif','image/gif']
]);

protocol.registerSchemesAsPrivileged([{scheme:'emx-media',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);

function binaryPaths(){
  if(app.isPackaged){
    return {
      ffmpeg:path.join(process.resourcesPath,'bin','ffmpeg.exe'),
      ffprobe:path.join(process.resourcesPath,'bin','ffprobe.exe')
    };
  }
  return {
    ffmpeg:process.env.EMX_FFMPEG_PATH || require('ffmpeg-static'),
    ffprobe:process.env.EMX_FFPROBE_PATH || require('ffprobe-static').path
  };
}

function sendJob(jobId,type,payload={}){
  if(mainWindow && !mainWindow.isDestroyed()){
    mainWindow.webContents.send('emx:job-event',{jobId,type,...payload});
  }
}


function audioAIRuntimePaths(){
  const bundled=app.isPackaged
    ? path.join(process.resourcesPath,'ai-runtime')
    : path.join(__dirname,'..','build','ai-runtime');
  const managed=path.join(app.getPath('userData'),'AudioAI','runtime');
  return {bundled,managed};
}
function preferredAudioAIRuntime(){
  const p=audioAIRuntimePaths();
  if(cliReady(p.bundled))return {runtimeDir:p.bundled,source:'bundled'};
  if(cliReady(p.managed))return {runtimeDir:p.managed,source:'managed'};
  return {runtimeDir:p.managed,source:'missing'};
}
async function ensureAudioAIRuntime(jobId,{force=false}={}){
  const bins=binaryPaths();
  const preferred=preferredAudioAIRuntime();
  if(!force&&preferred.source!=='missing'){
    return {ok:true,ready:true,runtimeDir:preferred.runtimeDir,source:preferred.source,...aiStatus(preferred.runtimeDir)};
  }
  const paths=audioAIRuntimePaths();
  const runtimeDir=force?paths.managed:preferred.runtimeDir;
  const result=await setupAudioAI({
    runtimeDir,ffmpegPath:bins.ffmpeg,force,
    onStatus:message=>sendJob(jobId,'status',{message}),
    onLog:log=>sendJob(jobId,'log',{log}),
    onProgress:progress=>sendJob(jobId,'progress',{progress})
  });
  return {ok:true,ready:true,runtimeDir,source:'managed',...aiStatus(runtimeDir),setup:result};
}

function safeBase(name){
  return (name||'media').replace(/[<>:"/\\|?*\x00-\x1F]/g,'_').slice(0,120);
}

function preferencePath(){return path.join(app.getPath('userData'),'editor-preferences.json')}
function loadPreferences(){
  try{
    const parsed=JSON.parse(fs.readFileSync(preferencePath(),'utf8'));
    defaultImportFolder=isDirectory(parsed?.defaultImportFolder)?parsed.defaultImportFolder:'';
  }catch{defaultImportFolder=''}
}
function savePreferences(){
  fs.mkdirSync(path.dirname(preferencePath()),{recursive:true});
  fs.writeFileSync(preferencePath(),JSON.stringify({defaultImportFolder},null,2),'utf8');
}
function isDirectory(candidate){
  try{return typeof candidate==='string'&&path.isAbsolute(candidate)&&fs.statSync(candidate).isDirectory()}catch{return false}
}
function supportedMediaPath(candidate){
  if(typeof candidate!=='string'||!path.isAbsolute(candidate)||!fs.existsSync(candidate))return null;
  const mime=mediaExtensions.get(path.extname(candidate).toLowerCase());
  return mime?{path:candidate,mime}:null;
}
function createMediaDescriptor(candidate){
  const media=supportedMediaPath(candidate);
  if(!media)return null;
  const mediaToken=crypto.randomUUID();
  mediaTokens.set(mediaToken,media.path);
  return {
    mediaToken,nativePath:media.path,name:path.basename(media.path),mime:media.mime,
    url:`emx-media://local/${mediaToken}`
  };
}
function mediaDialogFilters(){
  return [
    {name:'Video, audio, and image overlays',extensions:[...mediaExtensions.keys()].map(ext=>ext.slice(1))}
  ];
}

function createWindow(){
  mainWindow=new BrowserWindow({
    width:1520,height:980,minWidth:1100,minHeight:720,
    backgroundColor:'#07030c',
    icon:path.join(__dirname,'..','build','emx-clip-studio.ico'),
    title:`EMX Clip Studio V${app.getVersion()}`,
    show:false,autoHideMenuBar:true,
    webPreferences:{
      contextIsolation:true,
      nodeIntegration:false,
      sandbox:false,
      webSecurity:true,
      preload:path.join(__dirname,'preload.cjs')
    }
  });
  mainWindow.setMenuBarVisibility(false);
  const isDev=process.argv.includes('--dev');
  if(isDev) mainWindow.loadURL('http://127.0.0.1:5173');
  else mainWindow.loadFile(path.join(__dirname,'..','dist','index.html'));
  mainWindow.once('ready-to-show',()=>mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({url})=>{shell.openExternal(url);return{action:'deny'}});
  mainWindow.on('closed',()=>{mainWindow=null});
}

app.whenReady().then(()=>{
  app.setAppUserModelId('com.emxtweaks.clipstudio');
  loadPreferences();
  protocol.handle('emx-media',request=>{
    const mediaToken=decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/,''));
    const mediaPath=mediaTokens.get(mediaToken);
    if(!mediaPath||!supportedMediaPath(mediaPath))return new Response('Media is unavailable.',{status:404});
    const range=request.headers.get('range');
    return net.fetch(pathToFileURL(mediaPath).href,range?{headers:{Range:range}}:undefined).then(response=>{
      const headers=new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin','*');
      return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
    });
  });
  createWindow();
  updateService=new EmxUpdateService({
    app,
    sendUpdate:update=>{
      if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('emx:update-event',update);
    }
  });
  const updaterState=updateService.initialize();
  if(updaterState.configured){
    setTimeout(()=>{updateService.checkForUpdates()},4500);
  }

  ipcMain.handle('emx:health-check',async()=>{
    const bins=binaryPaths();
    const result={desktop:true,ffmpegPath:bins.ffmpeg,ffprobePath:bins.ffprobe,ffmpeg:false,ffprobe:false};
    try{result.ffmpegVersion=await versionLine(bins.ffmpeg);result.ffmpeg=true}catch(e){result.ffmpegError=String(e.message||e)}
    try{result.ffprobeVersion=await versionLine(bins.ffprobe);result.ffprobe=true}catch(e){result.ffprobeError=String(e.message||e)}
    return result;
  });

  ipcMain.handle('emx:reveal-in-explorer',async(_event,filePath)=>{
    if(typeof filePath!=='string'||!path.isAbsolute(filePath)||!fs.existsSync(filePath)){
      throw new Error('The requested media file is no longer available on this PC.');
    }
    shell.showItemInFolder(filePath);
    return {ok:true};
  });

  ipcMain.handle('emx:choose-import-folder',async()=>{
    const result=await dialog.showOpenDialog(mainWindow,{
      title:'Choose EMX Clips Folder',
      defaultPath:isDirectory(defaultImportFolder)?defaultImportFolder:app.getPath('videos'),
      properties:['openDirectory']
    });
    return result.canceled||!result.filePaths[0]?{canceled:true}:{canceled:false,folderPath:result.filePaths[0]};
  });
  ipcMain.handle('emx:set-default-import-folder',async(_event,folderPath)=>{
    if(!isDirectory(folderPath))throw new Error('That folder is no longer available. Choose another clips folder.');
    defaultImportFolder=folderPath;
    savePreferences();
    return {ok:true,folderPath:defaultImportFolder};
  });
  ipcMain.handle('emx:get-import-location',async()=>({defaultImportFolder}));
  ipcMain.handle('emx:select-import-media',async()=>{
    const result=await dialog.showOpenDialog(mainWindow,{
      title:'Import Media into EMX Clip Studio',
      defaultPath:isDirectory(defaultImportFolder)?defaultImportFolder:app.getPath('videos'),
      properties:['openFile','multiSelections'],filters:mediaDialogFilters()
    });
    if(result.canceled)return {canceled:true,items:[]};
    const items=result.filePaths.map(createMediaDescriptor).filter(Boolean);
    return {canceled:false,items};
  });
  ipcMain.handle('emx:import-folder-media',async(_event,folderPath)=>{
    if(!isDirectory(folderPath))throw new Error('That folder is no longer available. Choose another clips folder.');
    const items=fs.readdirSync(folderPath,{withFileTypes:true})
      .filter(entry=>entry.isFile())
      .map(entry=>createMediaDescriptor(path.join(folderPath,entry.name)))
      .filter(Boolean);
    return {items};
  });
  ipcMain.handle('emx:release-media-token',async(_event,mediaToken)=>{
    if(typeof mediaToken==='string')mediaTokens.delete(mediaToken);
    return {ok:true};
  });

  ipcMain.handle('emx:extract-audio',async(_event,payload)=>{
    const bins=binaryPaths();
    const jobId=payload.jobId||crypto.randomUUID();
    const outDir=path.join(app.getPath('userData'),'ExtractedAudio');
    fs.mkdirSync(outDir,{recursive:true});
    const outName=`${safeBase(payload.baseName||'audio').replace(/\.[^.]+$/,'')}_${Date.now()}.m4a`;
    const outputPath=path.join(outDir,outName);
    sendJob(jobId,'status',{message:'Checking source audio stream...'});
    const result=await extractAudio({
      inputPath:payload.inputPath,outputPath,
      ffmpegPath:bins.ffmpeg,ffprobePath:bins.ffprobe,
      onProgress:p=>sendJob(jobId,'progress',{progress:p}),
      onLog:log=>sendJob(jobId,'log',{log})
    });
    sendJob(jobId,'status',{message:'Verifying extracted audio...'});
    const data=fs.readFileSync(outputPath);
    sendJob(jobId,'complete',{message:'Audio extraction verified.'});
    return {ok:true,path:outputPath,name:outName,mime:'audio/mp4',data,duration:result.duration,size:result.size};
  });

  ipcMain.handle('emx:export-project',async(_event,payload)=>{
    if(!payload?.project||typeof payload.project!=='object')throw new Error('A valid export project is required.');
    const bins=binaryPaths();
    const jobId=payload.jobId||crypto.randomUUID();
    const defaultPath=path.join(app.getPath('videos'),payload.suggestedName||`EMX_Clip_${Date.now()}.mp4`);
    const chosen=await dialog.showSaveDialog(mainWindow,{
      title:'Export EMX MP4',
      defaultPath,
      filters:[{name:'MP4 Video',extensions:['mp4']}]
    });
    if(chosen.canceled||!chosen.filePath)return{ok:false,canceled:true};

    sendJob(jobId,'status',{message:'Preflight: verifying media paths and streams...'});
    const project={
      ...payload.project,
      branding:{
        ...normalizeWatermark(payload.project?.branding),
        assetPath:watermarkAssetPath({
          isPackaged:app.isPackaged,
          resourcesPath:process.resourcesPath,
          projectRoot:path.join(__dirname,'..')
        })
      }
    };

    const result=await exportProject({
      project,outputPath:chosen.filePath,
      ffmpegPath:bins.ffmpeg,ffprobePath:bins.ffprobe,
      onProgress:p=>sendJob(jobId,'progress',{progress:p}),
      onLog:log=>sendJob(jobId,'log',{log})
    });
    sendJob(jobId,'complete',{message:'MP4 export verified.'});
    return {ok:true,...result};
  });



  ipcMain.handle('emx:ai-status',async()=>{
    const preferred=preferredAudioAIRuntime();
    const status=aiStatus(preferred.runtimeDir);
    return {...status,source:preferred.source,friendReady:preferred.source==='bundled'};
  });

  ipcMain.handle('emx:ai-ensure',async(_event,payload)=>{
    const jobId=payload?.jobId||crypto.randomUUID();
    try{
      const result=await ensureAudioAIRuntime(jobId,{force:false});
      sendJob(jobId,'complete',{message:'EMX Audio AI runtime ready.'});
      return result;
    }catch(err){
      sendJob(jobId,'status',{message:'EMX Audio AI automatic setup failed.'});
      throw err;
    }
  });

  ipcMain.handle('emx:ai-repair',async(_event,payload)=>{
    const jobId=payload?.jobId||crypto.randomUUID();
    const paths=audioAIRuntimePaths();
    try{
      if(fs.existsSync(paths.managed))fs.rmSync(paths.managed,{recursive:true,force:true});
      const result=await ensureAudioAIRuntime(jobId,{force:true});
      sendJob(jobId,'complete',{message:'EMX Audio AI repair complete.'});
      return result;
    }catch(err){
      sendJob(jobId,'status',{message:'EMX Audio AI repair failed.'});
      throw err;
    }
  });

  ipcMain.handle('emx:ai-process',async(_event,payload)=>{
    const bins=binaryPaths();
    const jobId=payload?.jobId||crypto.randomUUID();
    const runtime=await ensureAudioAIRuntime(jobId,{force:false});
    const baseDir=path.join(app.getPath('userData'),'AudioAI');
    const jobDir=path.join(baseDir,'jobs',`${Date.now()}_${jobId.replace(/[^a-z0-9-]/gi,'')}`);
    fs.mkdirSync(jobDir,{recursive:true});
    const result=await processAudioAI({
      runtimeDir:runtime.runtimeDir,baseDir,ffmpegPath:bins.ffmpeg,
      inputPath:payload.inputPath,mode:payload.mode,jobDir,
      onStatus:message=>sendJob(jobId,'status',{message}),
      onLog:log=>sendJob(jobId,'log',{log}),
      onProgress:progress=>sendJob(jobId,'progress',{progress})
    });
    const outputs=result.files.map(filePath=>{
      const data=fs.readFileSync(filePath);
      return {
        path:filePath,name:path.basename(filePath),mime:'audio/wav',data,size:data.length
      };
    });
    sendJob(jobId,'complete',{message:'Audio AI processing complete.'});
    return {ok:true,mode:result.mode,outputs};
  });

  ipcMain.handle('emx:update-status',async()=>updateService?.getState()||null);
  ipcMain.handle('emx:update-check',async()=>updateService?.checkForUpdates()||null);
  ipcMain.handle('emx:update-download',async()=>updateService?.downloadUpdate()||null);
  ipcMain.handle('emx:update-install',async()=>updateService?.installAndRestart()||null);

  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
