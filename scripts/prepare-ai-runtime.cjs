const path=require('path');
const fs=require('fs');
const {ensureEmbeddedRuntime,cliReady}=require('../electron/ai-runtime.cjs');

async function main(){
  if(process.platform!=='win32'){
    console.error('EMX friend-ready AI runtime preparation must be run on Windows x64.');
    process.exit(1);
  }
  const project=path.resolve(__dirname,'..');
  const runtimeDir=path.join(project,'build','ai-runtime');
  const ffmpeg=path.join(project,'build','native','ffmpeg.exe');

  if(cliReady(runtimeDir)){
    console.log('EMX Audio AI runtime already prepared.');
    return;
  }
  if(!fs.existsSync(ffmpeg)){
    console.error('Native FFmpeg is missing. Run npm run prepare:native first.');
    process.exit(1);
  }

  console.log('==================================================');
  console.log(' EMX FRIEND-READY AUDIO AI RUNTIME');
  console.log(' No end-user Python/account setup will be needed.');
  console.log('==================================================');

  await ensureEmbeddedRuntime({
    runtimeDir,ffmpegPath:ffmpeg,
    onStatus:m=>console.log('[EMX]',m),
    onLog:l=>console.log(l),
    onProgress:p=>{
      const pct=Math.round((p||0)*100);
      process.stdout.write(`\r[EMX] ${String(pct).padStart(3)}%`);
      if(pct>=100)process.stdout.write('\n');
    }
  });

  console.log('Friend-ready Audio AI runtime verified:',runtimeDir);
}
main().catch(err=>{
  console.error('\nEMX Audio AI runtime preparation failed:\n',err.stack||err);
  process.exit(1);
});
