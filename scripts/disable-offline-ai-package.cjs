const fs=require('fs');
const path=require('path');
const p=path.join(__dirname,'..','package.json');
const backup=path.join(__dirname,'..','package.fast-backup.json');
if(fs.existsSync(backup)){
  fs.copyFileSync(backup,p);
  fs.unlinkSync(backup);
  console.log('Fast packaging config restored.');
}
