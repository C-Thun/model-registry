import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,statfsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {initRegistry,publish,readRegistry,readJson,gitPreflight,validateArtifact,lockRegistry,publicationPaths,inside} from './registry.mjs';
const toolkit=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function parseArgs(args){
 const action=args.shift();if(!['init','export'].includes(action))throw new Error('用法：init|export [模型库路径] [--import 目录] [--python 路径] [--profile-dir 目录 --profile-id 标识 --profile-version 版本]');
 const result={action,root:toolkit};if(args[0]&&!args[0].startsWith('--'))result.root=resolve(args.shift());
 const keys={'--import':'sourceDirectory','--python':'python','--profile-dir':'profileDirectory','--profile-id':'profileId','--profile-version':'profileVersion'};
 while(args.length){const flag=args.shift();if(!keys[flag]||!args[0]||args[0].startsWith('--')||result[keys[flag]])throw new Error('未知/重复参数或缺少参数值');result[keys[flag]]=args.shift();}
 if(Boolean(result.profileDirectory)!==Boolean(result.profileId))throw new Error('profile-dir / profile-id 必须同时提供');return result;
}
export function preflight(){const [major,minor]=process.versions.node.split('.').map(Number);if(major<22||major===22&&minor<12)throw new Error('需要 Node.js >=22.12');}
function pythonEnvironment(recipe,provided){
 const verify=python=>{let tools;try{tools=JSON.parse(execFileSync(python,['-c','import sys,torch,transformers,onnx,onnxruntime,numpy,json; print(json.dumps(dict(python=f"{sys.version_info.major}.{sys.version_info.minor}",torch=torch.__version__,transformers=transformers.__version__,onnx=onnx.__version__,onnxruntime=onnxruntime.__version__,numpy=numpy.__version__)))'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));}catch{throw new Error('指定 Python 环境缺少固定 CPU 导出依赖；请使用本库 requirements-export.txt 准备隔离环境');}if(JSON.stringify(tools)!==JSON.stringify(recipe.tools))throw new Error('指定 Python 的版本/导出依赖与固定配方不符');return python;};
 if(provided)return verify(resolve(provided));
 const data=process.platform==='win32'?process.env.LOCALAPPDATA:process.env.XDG_DATA_HOME?.startsWith('/')?process.env.XDG_DATA_HOME:join(homedir(),'.local/share');if(!data)throw new Error('无法确定用户数据目录');
 const environment=join(data,'model-registry','tools','tinyclip-v1'),python=join(environment,process.platform==='win32'?'Scripts/python.exe':'bin/python');if(existsSync(python))return verify(python);
 const base=process.platform==='win32'?'python':'python3';
 try{const version=String(execFileSync(base,['-c','import sys,venv,ensurepip; print(f"{sys.version_info.major}.{sys.version_info.minor}")'],{encoding:'utf8'})).trim();if(version!==recipe.tools.python)throw new Error('version');}catch{throw new Error(`制作端需要 Python ${recipe.tools.python} 及 venv/ensurepip；请先安装（Ubuntu: python3-venv），未开始模型写入`);}
 console.error('准备隔离 CPU 导出环境（固定版本，首次可能较慢）');
 execFileSync(base,['-m','venv',environment],{stdio:['ignore',2,2]});
 execFileSync(python,['-m','pip','install','--index-url','https://pypi.org/simple','--extra-index-url','https://download.pytorch.org/whl/cpu','-r',join(toolkit,'recipes/tinyclip-v1/requirements-export.txt')],{stdio:['ignore',2,2]});return verify(python);
}
export function run(args=process.argv.slice(2)){
 preflight();const options=parseArgs([...args]);
 if(options.action==='init'){const info=initRegistry(options.root);return {schema:1,registryRoot:info.root,registryId:info.registryId};}
 const recipePath=join(toolkit,'recipes/tinyclip-v1/recipe.json'),recipe=readJson(recipePath),root=readRegistry(options.root).root;
 const ap=`onnx/${recipe.id}/${recipe.version}`,pp=options.profileDirectory?`profiles/${options.profileId}/${options.profileVersion??'v1'}`:null;
 gitPreflight(root,publicationPaths(recipe,options.profileDirectory,options.profileId,options.profileVersion)); // environment requirements before downloads or model writes
 const staging=inside(root,'.staging');
 const unlock=lockRegistry(root);
 let source=options.sourceDirectory?resolve(options.sourceDirectory):null,stage=null,provenance={kind:'verified-import'};
 try{
  if(!source&&existsSync(join(root,ap))){source=validateArtifact(root,ap).directory;provenance={kind:'verified-reuse'};}
  if(!source){const disk=statfsSync(root,{bigint:true});if(disk.bavail*disk.bsize<4n*1024n**3n)throw new Error('模型导出需要至少 4 GiB 可用空间（权重、暂存与 LFS）；未开始下载');const python=pythonEnvironment(recipe,options.python);mkdirSync(staging,{recursive:true});stage=mkdtempSync(join(staging,'export-'));console.error('导出固定 TinyCLIP 图像编码器');execFileSync(python,[join(toolkit,'scripts/export-tinyclip.py'),'--recipe',recipePath,'--output',stage],{stdio:['ignore',2,2]});source=stage;provenance={kind:'cpu-export',...readJson(join(stage,'probe.json'))};}
  return publish({...options,root,locked:true,sourceDirectory:source,recipe,license:join(toolkit,'recipes/tinyclip-v1/LICENSE.txt'),provenance});
 }catch(error){if(stage){console.error(`未通过准入，导出暂存保留供检查：${stage}`);stage=null;}throw error;}finally{if(stage)rmSync(stage,{recursive:true,force:true});unlock();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))try{console.log(JSON.stringify(run()));}catch(error){console.error(`✗ ${error.message}`);process.exitCode=1;}
