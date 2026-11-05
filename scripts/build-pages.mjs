import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'work/pages/site');
const git=(...args)=>execFileSync('git',args,{cwd:root});
const ref=git('rev-parse','HEAD').toString().trim();
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
for(const file of git('ls-tree','-r','--name-only',ref,'web').toString().trim().split('\n')){
 const target=path.join(out,file.slice(4));await mkdir(path.dirname(target),{recursive:true});await writeFile(target,git('show',`${ref}:${file}`));
}
function once(text,old,next){assert.equal(text.split(old).length-1,1,`Pages source changed: ${old.slice(0,75)}`);return text.replace(old,next);}
function section(text,start,end,next){assert.equal(text.split(start).length-1,1,`Missing section: ${start}`);const a=text.indexOf(start),b=text.indexOf(end,a);assert(b>a,`Missing section end: ${end}`);return text.slice(0,a)+next+'\n'+text.slice(b);}
let app=await readFile(path.join(out,'app.js'),'utf8');
for(const name of ['drafts','drafts-ui'])app=once(app,`from './${name}.js'`,`from './preview-${name}.js'`);
app=section(app,"$('cutout').onclick=async()=>{",'function download(',"$('cutout').onclick=()=>notice('在线预览不提供抠图，请使用本机完整版。',true);");
const status="try{const status=await(await fetch('/api/status'))";assert.equal(app.split(status).length-1,1);app=app.slice(0,app.indexOf(status))+"$('model-status').textContent='在线预览不提供抠图，请使用本机完整版。';draw();\n";
app=once(app,'drafts.backedUp();',"drafts.backedUp();dirty=false;$('save-indicator').textContent=$('draft-status').textContent;document.title='图片批处理工作台 · 在线预览';");
app=once(app,'项目已打开并更新当前缓存，可撤销。','项目已载入当前页面，可撤销；请下载 JSON 保留修改。');
app=once(app,'已有草稿已保留。','当前页面内容已保留。');
app=once(app,'正在本机压缩PNG…','正在浏览器编码 PNG…');
app=once(app,'导出包保留20分钟用于重新下载。','当前页面可重新下载，刷新后失效。');
app=once(app,';const link=$(\'export-download\');',";exportAbort.signal.throwIfAborted();const link=$('export-download');");
assert(!app.includes("fetch('/api/"),'Preview must not call a backend');await writeFile(path.join(out,'app.js'),app);
for(const name of ['drafts','drafts-ui','compression','archive-client']){let content=await readFile(path.join(root,'preview',`${name}.js`),'utf8');content=content.replaceAll('../web/','./').replace('../node_modules/@zip.js/zip.js/dist/zip-core-external.min.js','./vendor/zip.js');await writeFile(path.join(out,['drafts','drafts-ui'].includes(name)?`preview-${name}.js`:`${name}.js`),content);}
await writeFile(path.join(out,'preview-style.css'),await readFile(path.join(root,'preview/style.css')));
const zipRoot=path.join(root,'node_modules/@zip.js/zip.js');assert.equal(JSON.parse(await readFile(path.join(zipRoot,'package.json'),'utf8')).version,'2.24.0');await mkdir(path.join(out,'vendor'),{recursive:true});
for(const [from,to]of [['dist/zip-core-external.min.js','zip.js'],['LICENSE','zip.LICENSE']])await writeFile(path.join(out,'vendor',to),await readFile(path.join(zipRoot,from)));
let exporter=await readFile(path.join(out,'exporter.js'),'utf8');exporter=once(exporter,'正在完成本机ZIP…','正在浏览器完成 ZIP…');await writeFile(path.join(out,'exporter.js'),exporter);
let html=await readFile(path.join(out,'index.html'),'utf8');assert(html.includes('src="/app.js"'));html=html.replace(/\b(src|href)="\//g,'$1="./');html=once(html,'PNG 默认在本机压缩。','PNG 由浏览器编码，未经 pngquant 优化；图片不上传。');html=once(html,'</head>','<link rel="stylesheet" href="./preview-style.css"></head>');html=once(html,'<title>图片批处理工作台</title>','<title>图片批处理工作台 · 在线预览</title>');await writeFile(path.join(out,'index.html'),html);
let css=await readFile(path.join(out,'style.css'),'utf8');css=css.replace(/url\((['"]?)\//g,'url($1./');assert(!/url\(['"]?\//.test(css));await writeFile(path.join(out,'style.css'),css);
for(const file of ['LICENSE','THIRD_PARTY_NOTICES.md'])await writeFile(path.join(out,file),git('show',`${ref}:${file}`));
await writeFile(path.join(out,'.nojekyll'),'');await writeFile(path.join(out,'build.json'),JSON.stringify({commit:ref,mode:'session-preview'}));
console.log(`Built Pages preview from ${ref} into work/pages/site`);
