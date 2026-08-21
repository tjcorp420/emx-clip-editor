const fs=require('fs');
const path=require('path');
const p=path.join(__dirname,'..','package.json');
const backup=path.join(__dirname,'..','package.fast-backup.json');
const pkg=JSON.parse(fs.readFileSync(p,'utf8'));
fs.writeFileSync(backup,JSON.stringify(pkg,null,2));
pkg.build.extraResources=pkg.build.extraResources||[];
if(!pkg.build.extraResources.some(x=>x&&x.to==='ai-runtime')){
  pkg.build.extraResources.push({from:'build/ai-runtime',to:'ai-runtime'});
}
fs.writeFileSync(p,JSON.stringify(pkg,null,2));
console.log('Offline AI runtime enabled for this build.');
