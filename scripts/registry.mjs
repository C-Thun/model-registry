/** Generic immutable model registry. No consumer-project discovery or publishing. */
import {createHash,randomUUID} from 'node:crypto';
import {closeSync,copyFileSync,existsSync,fstatSync,lstatSync,mkdirSync,openSync,readFileSync,readSync,readdirSync,realpathSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
export const digest=b=>createHash('sha256').update(b).digest('hex');
const json=b=>JSON.stringify(b,null,2)+'\n';
export function identifier(value){if(typeof value!=='string'||!/^[-a-z0-9][-.a-z0-9]{0,95}$/.test(value)||['.','..'].includes(value))throw new Error('模型/版本标识必须是1–96位小写 ASCII');return value;}
export function readJson(path,max=65536){if(!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink()||lstatSync(path).size>max)throw new Error('元数据类型或大小无效');return JSON.parse(readFileSync(path,'utf8'));}
export function verifyFile(path,file){
 if(!/^[A-Za-z0-9_.-]+$/.test(file.name)||['.','..'].includes(file.name)||!Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes>2*1024**3||!/^[a-f0-9]{64}$/.test(file.sha256))throw new Error('文件声明无效');
 const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==file.bytes)throw new Error(`模型文件大小/类型不符（请确认 LFS 已检出）：${file.name}`);
 const fd=openSync(path,'r'),h=createHash('sha256'),b=Buffer.alloc(1048576);let size=0,count;
 try{if(fstatSync(fd).size!==file.bytes)throw new Error('文件在校验期间变化');while((count=readSync(fd,b,0,b.length,null))){size+=count;if(size>file.bytes)throw new Error('文件超出声明');h.update(b.subarray(0,count));}if(size!==file.bytes||h.digest('hex')!==file.sha256)throw new Error(`模型 SHA-256 不符：${file.name}`);}finally{closeSync(fd);}
}
export function inside(root,path){
 if(typeof path!=='string'||path.includes('\\')||path.startsWith('/')||path.split('/').some(p=>!p||p==='.'||p==='..'||!/^[A-Za-z0-9_.-]+$/.test(p)))throw new Error('模型路径无效');
 root=realpathSync(root);let current=root;for(const part of path.split('/')){current=join(current,part);if(existsSync(current)&&lstatSync(current).isSymbolicLink())throw new Error('模型路径含链接');}
 if(!current.startsWith(root+sep))throw new Error('模型路径越界');return current;
}
export function readRegistry(root){
 root=resolve(root);if(lstatSync(root).isSymbolicLink()||!lstatSync(root).isDirectory())throw new Error('模型库根不是普通目录');
 const marker=readJson(join(root,'.model-registry.json'),2048);if(marker.schema!==1||marker.kind!=='model-registry'||!/^[-a-f0-9]{36}$/.test(marker.registryId))throw new Error('不是有效 model-registry');return {...marker,root:realpathSync(root)};
}
export function validateArtifact(root,path){
 readRegistry(root);if(path.split('/').length!==3||path.split('/')[0]!=='onnx')throw new Error('模型必须用 onnx/模型/导出版本定位');path.split('/').slice(1).forEach(identifier);
 const directory=inside(root,path),meta=readJson(join(directory,'artifact.json'));
 if(meta.schema!==1||meta.format!=='onnx'||meta.id!==path.split('/')[1]||meta.version!==path.split('/')[2]||!Array.isArray(meta.files)||meta.files.length<2||meta.files.length>64||new Set(meta.files.map(f=>f.name)).size!==meta.files.length)throw new Error('通用模型元数据无效');
 for(const file of meta.files)verifyFile(inside(root,`${path}/${file.name}`),file);
 return {path,directory,meta,sha256:digest(readFileSync(join(directory,'artifact.json')))};
}
function git(root,args){const result=String(execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}));return args[0]==='status'?result:result.trim();}
function gitRoot(root){try{return realpathSync(git(root,['rev-parse','--show-toplevel']));}catch{return null;}}
export function gitPreflight(root,owned=[]){
 const actual=gitRoot(root);if(!actual)return null;if(actual!==realpathSync(root))throw new Error('模型库必须是 Git 根，不能提交到祖先仓库');
 try{git(root,['lfs','version']);}catch{throw new Error('Git LFS 未就绪；请先安装 git-lfs，再运行 git lfs install');}
 try{git(root,['symbolic-ref','--quiet','HEAD']);}catch{throw new Error('模型库处于 detached HEAD，请先切到可写分支');}
 if(!git(root,['config','user.name'])||!git(root,['config','user.email']))throw new Error('请先配置本仓 Git user.name / user.email');
 for(const state of ['MERGE_HEAD','rebase-merge','rebase-apply'])if(existsSync(resolve(root,git(root,['rev-parse','--git-path',state]))))throw new Error('模型库正在 merge/rebase');
 const status=git(root,['status','--porcelain=v1','-z','--untracked-files=all']);
 // With -z, paths are literal (no quoting); rename has a second path and is always rejected.
 for(const record of status.split('\0').filter(Boolean)){const path=record.slice(3);if(record[0]==='R'||record[1]==='R'||!owned.includes(path))throw new Error(`模型库有无关改动，拒绝自动提交：${path}`);}
 let head=null;try{head=git(root,['rev-parse','HEAD']);}catch{}
 const index=resolve(root,git(root,['rev-parse','--git-path','index']));return {head,indexHash:existsSync(index)?digest(readFileSync(index)):null,index};
}
export function commitOwned(root,paths,before){
 if(!before)return null;
 const now=gitPreflight(root,paths);if(now.head!==before.head||now.indexHash!==before.indexHash)throw new Error('Git HEAD/index 在制作期间变化，保留制品但不提交');
 if(!git(root,['status','--porcelain=v1','--',...paths]))return before.head;
 git(root,['add','--',...paths]);gitPreflight(root,paths);
 try{git(root,['commit','-m','feat: 添加已验证模型制品与消费配置','--',...paths]);}catch{throw new Error('模型已保存但 Git 提交失败；请修复 Git 身份/LFS/hook 后重试，消费源尚未更新');}
 return git(root,['rev-parse','HEAD']);
}
export function initRegistry(root){
 root=resolve(root);
 if(existsSync(root)&&lstatSync(root).isSymbolicLink())throw new Error('拒绝初始化链接目录');
 // Inspect the nearest existing ancestor before creating anything.
 let ancestor=root;while(!existsSync(ancestor))ancestor=dirname(ancestor);
 const actual=gitRoot(ancestor);
 if(actual&&(!existsSync(root)||actual!==realpathSync(root)))throw new Error('模型库必须是 Git 根，不能接管祖先仓库内的目录');
 const attributes='onnx/**/*.onnx filter=lfs diff=lfs merge=lfs -text\n',ap=join(root,'.gitattributes');
 if(existsSync(ap)&&(lstatSync(ap).isSymbolicLink()||readFileSync(ap,'utf8')!==attributes))throw new Error('已有 attributes 不匹配，拒绝覆盖');
 if(existsSync(join(root,'.model-registry.json'))){const info=readRegistry(root);if(actual){git(root,['lfs','version']);git(root,['lfs','install','--local']);}return info;}
 if(existsSync(root)&&readdirSync(root).some(n=>!['.git','README.md','readme.md','LICENSE','.gitignore','.gitattributes'].includes(n)))throw new Error('拒绝接管非空未知目录');
 const owned=['.model-registry.json','.gitattributes','.gitignore'];
 const before=actual?gitPreflight(root,[]):null;
 if(actual)git(root,['lfs','install','--local']);
 mkdirSync(root,{recursive:true});
 if(!existsSync(ap))writeFileSync(ap,attributes,{flag:'wx'});
 if(!existsSync(join(root,'.gitignore')))writeFileSync(join(root,'.gitignore'),'.locks/\n.staging/\n',{flag:'wx'});
 writeFileSync(join(root,'.model-registry.json'),json({schema:1,kind:'model-registry',registryId:randomUUID()}),{flag:'wx'});
 commitOwned(root,owned,before);
 return readRegistry(root);
}
export function lockRegistry(root){
 root=readRegistry(root).root;const directory=inside(root,'.locks');mkdirSync(directory,{recursive:true});
 const path=join(directory,'export.lock');try{writeFileSync(path,json({pid:process.pid,startedAt:new Date().toISOString()}),{flag:'wx'});}catch{throw new Error('模型库制作锁已存在，请确认没有制作进程后处理残留锁');}
 return()=>rmSync(path);
}
function declaration(path,name){const b=readFileSync(path);return {name,bytes:b.length,sha256:digest(b)};}
export function publicationPaths(recipe,profileDirectory,profileId,profileVersion='v1'){
 const path=`onnx/${identifier(recipe.id)}/${identifier(recipe.version)}`;
 const owned=[recipe.model.name,'LICENSE.txt','artifact.json','export.json'].map(n=>`${path}/${n}`);
 if(profileDirectory){const pp=`profiles/${identifier(profileId)}/${identifier(profileVersion)}`,manifest=readJson(join(profileDirectory,'manifest.json'));
  if(!Array.isArray(manifest.files)||manifest.files.length>64)throw new Error('profile 文件清单无效');
  for(const f of manifest.files)if(typeof f.name!=='string'||!/^[A-Za-z0-9_.-]+$/.test(f.name)||['.','..','manifest.json','profile.json'].includes(f.name))throw new Error('profile 文件声明无效');
  owned.push(...['manifest.json','profile.json',...manifest.files.filter(f=>f.name!==recipe.model.name).map(f=>f.name)].map(n=>`${pp}/${n}`));
 }
 return owned;
}
export function publish({root,sourceDirectory,recipe,license,profileDirectory,profileId,profileVersion='v1',commit=true,locked=false,provenance={kind:'verified-import'}}){
 root=readRegistry(root).root;identifier(recipe.id);identifier(recipe.version);
 const path=`onnx/${recipe.id}/${recipe.version}`,pp=profileDirectory?`profiles/${identifier(profileId)}/${identifier(profileVersion)}`:null;
 const owned=publicationPaths(recipe,profileDirectory,profileId,profileVersion);
 const before=commit?gitPreflight(root,owned):null;
 if(before){const attrs=git(root,['check-attr','filter','--',`${path}/${recipe.model.name}`]);if(!attrs.endsWith(': lfs'))throw new Error('ONNX 未由 Git LFS 跟踪，请先初始化本库');}
 verifyFile(join(sourceDirectory,recipe.model.name),recipe.model);
 const licenseFile=declaration(license,'LICENSE.txt');
 const meta={schema:1,format:'onnx',id:recipe.id,version:recipe.version,source:recipe.source,precision:recipe.precision,opset:recipe.opset,contract:recipe.contract,files:[recipe.model,licenseFile]},raw=json(meta),sha=digest(raw);
 let manifestRaw,local;
 if(pp){
  const manifest=readJson(join(profileDirectory,'manifest.json'));manifestRaw=readFileSync(join(profileDirectory,'manifest.json'));
  if(!Array.isArray(manifest.files)||manifest.files.length<1||manifest.files.length>64||new Set(manifest.files.map(f=>f.name)).size!==manifest.files.length)throw new Error('profile 文件清单无效');
  const image=manifest.files.find(f=>f.name===recipe.model.name);if(!image||image.sha256!==recipe.model.sha256||image.bytes!==recipe.model.bytes)throw new Error('profile 与模型绑定不符');
  local=manifest.files.filter(f=>f.name!==recipe.model.name);
  for(const f of local){if(f.name.endsWith('.onnx')||['manifest.json','profile.json'].includes(f.name))throw new Error('profile 不允许复制 ONNX 或保留的元数据文件');verifyFile(join(profileDirectory,f.name),f);}
 }
 const unlock=locked?()=>{}:lockRegistry(root);let stage;
 try{
  const target=inside(root,path);
  if(existsSync(target)){if(validateArtifact(root,path).sha256!==sha)throw new Error('同名模型版本内容不同，禁止覆盖');}
  else{stage=join(root,'.staging',randomUUID());mkdirSync(stage,{recursive:true});copyFileSync(join(sourceDirectory,recipe.model.name),join(stage,recipe.model.name));verifyFile(join(stage,recipe.model.name),recipe.model);copyFileSync(license,join(stage,'LICENSE.txt'));writeFileSync(join(stage,'artifact.json'),raw);writeFileSync(join(stage,'export.json'),json({...provenance,tools:recipe.tools,recipeSha256:digest(json(recipe)),completedAt:new Date().toISOString()}));mkdirSync(dirname(target),{recursive:true});renameSync(stage,target);stage=null;}
  let profileManifestSha256=null;
  if(pp){
   profileManifestSha256=digest(manifestRaw);const profile={schema:1,artifact:path,artifactSha256:sha,manifestSha256:profileManifestSha256,files:local};const profileRaw=json(profile),dest=inside(root,pp);
   if(existsSync(dest)){if(digest(readFileSync(join(dest,'profile.json')))!==digest(profileRaw)||digest(readFileSync(join(dest,'manifest.json')))!==profileManifestSha256)throw new Error('同名 profile 内容不同，禁止覆盖');for(const f of local)verifyFile(join(dest,f.name),f);}
   else{stage=join(root,'.staging',randomUUID());mkdirSync(stage,{recursive:true});for(const f of local){copyFileSync(join(profileDirectory,f.name),join(stage,f.name));verifyFile(join(stage,f.name),f);}writeFileSync(join(stage,'manifest.json'),manifestRaw);writeFileSync(join(stage,'profile.json'),profileRaw);mkdirSync(dirname(dest),{recursive:true});renameSync(stage,dest);stage=null;}
  }
  const commitHash=commitOwned(root,owned,before);
  return {schema:1,kind:'local-library',registryRoot:root,registryId:readRegistry(root).registryId,artifact:path,artifactSha256:sha,...(pp?{profile:pp,profileManifestSha256}:{}),commit:commitHash};
 }finally{if(stage)rmSync(stage,{recursive:true,force:true});unlock();}
}
