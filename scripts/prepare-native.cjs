
const fs=require('fs');
const path=require('path');

const ffmpeg=require('ffmpeg-static');
const ffprobe=require('ffprobe-static').path;

if(!ffmpeg || !fs.existsSync(ffmpeg)) throw new Error(`ffmpeg-static binary not found: ${ffmpeg}`);
if(!ffprobe || !fs.existsSync(ffprobe)) throw new Error(`ffprobe-static binary not found: ${ffprobe}`);

const out=path.join(__dirname,'..','build','native');
fs.mkdirSync(out,{recursive:true});
fs.copyFileSync(ffmpeg,path.join(out,'ffmpeg.exe'));
fs.copyFileSync(ffprobe,path.join(out,'ffprobe.exe'));
console.log('Prepared native media binaries:');
console.log(' -',ffmpeg);
console.log(' -',ffprobe);
