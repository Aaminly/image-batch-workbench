// 所有尺寸按近似比例归组：近方形长短边比≤1.25，横幅/窄竖版长短边比≥2.5。
import {MEDIA_KEYS,contentFor,SHARED_KEYS,inheritGroupContent} from './shared-content.js';
export function sizeGroupName(w,h){if(Math.max(w,h)*4<=Math.min(w,h)*5)return '方形';if(w>h)return w*2>=h*5?'横幅':'横版';return h*2>=w*5?'窄竖版':'竖版';}
export const PRESET_GROUPS=[
 {name:'方形',sizes:[[200,200],[250,250],[300,250],[336,280],[640,640],[720,900],[1080,1080],[1080,1350],[1200,1200]]},
 {name:'竖版',sizes:[[240,400],[250,360],[300,600],[600,900],[628,1200],[720,1280],[1000,1500],[1080,1440],[1080,1920]]},
 {name:'窄竖版',sizes:[[120,600],[160,600],[300,1050]]},
 {name:'横版',sizes:[[580,400],[1200,600],[1200,628],[1440,1080],[1920,1080]]},
 {name:'横幅',sizes:[[300,50],[320,50],[320,100],[468,60],[728,90],[750,100],[750,200],[750,300],[930,180],[970,90],[970,250],[980,120]]}
];
export const PRESETS=PRESET_GROUPS.flatMap(g=>g.sizes);
export function addAllPresets(project){const missing=PRESETS.filter(([w,h])=>!project.variants.some(v=>v.id===`${w}x${h}`));if(project.variants.length+missing.length>40)throw Error('加上自定义尺寸后超过40个，请先移除不需要的尺寸');for(const [w,h]of missing)addVariant(project,w,h);}

export function defaultTextLayer(){return {dx:0,dy:0,fontSize:null,scaleX:1,scaleY:1,width:null,height:null,color:null,fontWeight:null,italic:false,underline:'none',underlineColor:'#ffff00',separatorEnabled:false,separatorColor:'#ffff00',separatorWidth:1,separatorHeight:.8,strokeWidth:0,strokeColor:'#000000',shadowEnabled:false,shadowColor:'#000000',shadowOpacity:.6,shadowBlur:8,shadowX:2,shadowY:2};}
export function defaultTextLayers(){return Object.fromEntries(['title','subtitle','cta'].map(key=>[key,defaultTextLayer()]));}
export function createProject(){return {version:1,lockedGroups:[],backgroundMode:'matched',name:'未命名广告',backgrounds:[],activeBackgroundId:null,exportAllBackgrounds:false,assets:{original:null,cutout:null,logo:null,logoOriginal:null,logoCutout:null},source:'original',copy:{title:'下一部好剧',subtitle:'精彩故事，即刻开启',cta:'立即观看 →'},variants:[]};}
export function imageRect(iw,ih,box,scale=1,dx=0,dy=0){const s=Math.min(box.w/iw,box.h/ih)*scale;const w=iw*s,h=ih*s;return {x:box.x+(box.w-w)/2+dx,y:box.y+(box.h-h)/2+dy,w,h};}
export function defaultVariant(w,h){
 const pad=Math.max(2,Math.min(w,h)*.06),r=w/h;
 let box,text;
 if(r>=1.6){box={x:pad,y:pad,w:w*.43-pad*2,h:h-pad*2};text={x:w*.47,y:pad,w:w*.49-pad};}
 else if(r<.45){box={x:pad,y:pad,w:w-pad*2,h:h*.48-pad};text={x:pad,y:h*.53,w:w-pad*2};}
 else {box={x:pad,y:pad,w:w-pad*2,h:h*.57-pad};text={x:pad,y:h*.62,w:w-pad*2};}
 return {id:`${w}x${h}`,locked:false,width:w,height:h,box,text,scale:1,dx:0,dy:0,crop:false,imageScaleX:1,imageScaleY:1,logoScaleX:1,logoScaleY:1,feather:0,textLayers:defaultTextLayers(),backgroundPreference:null,bgZoom:1,bgX:.5,bgY:.5,fontSize:Math.max(8,Math.round(Math.min(w*.088,h*.18))),textColor:'#ffffff',accent:'#ffb35c',background:'solid',color:'#17242b',color2:'#3c5966',logoX:pad,logoY:pad,logoWidth:Math.min(w*.2,h*.18)};
}
export function addVariant(p,w,h){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<24||h<24||w>6000||h>6000||w*h>16000000)throw Error('尺寸需为24–6000之间的整数，且不超过1600万像素');
 if(p.variants.length>=40)throw Error('每个项目最多40个尺寸');
 const v=defaultVariant(w,h);if(p.variants.some(a=>a.id===v.id))throw Error('该尺寸已存在');p.variants.push(v);inheritGroupContent(p,v);return v;
}
export function updateVariant(p,id,patch){const v=p.variants.find(a=>a.id===id);if(!v)throw Error('尺寸不存在');Object.assign(v,patch);return v;}
const finite=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
const color=c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c);
export const MAX_PROJECT_BYTES=120*1024*1024;
export function clampPosition(n,min=-12000){return Math.max(min,Math.min(12000,n));}
export function validateProject(input,checkContent=true){
 if(!input||input.version!==1||typeof input.name!=='string'||input.name.length>100||!input.assets||!input.copy||!['original','cutout'].includes(input.source)||!Array.isArray(input.variants)||input.variants.length>40)throw Error('项目格式或版本不支持');
 const p=checkContent?structuredClone(input):input;
 if(!Object.hasOwn(p.assets,'logoOriginal'))p.assets.logoOriginal=null;
 if(!Object.hasOwn(p.assets,'logoCutout'))p.assets.logoCutout=null;
 if(p.media!==undefined&&(!p.media||Array.isArray(p.media)||typeof p.media!=='object'||Object.entries(p.media).some(([id,data])=>!/^m\d+$/.test(id)||typeof data!=='string'||data.length>45000000||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(data))))throw Error('锁定素材无效');
 if(p.mediaSerial!==undefined&&(!Number.isSafeInteger(p.mediaSerial)||p.mediaSerial<0))throw Error('素材编号无效');
 for(const content of [...p.variants.map(v=>v.content),p.sharedBaseline])if(content!==undefined){
  if(!content||Array.isArray(content)||typeof content!=='object'||Object.keys(content).some(k=>!SHARED_KEYS.includes(k)))throw Error('锁定内容无效');
  if(Object.hasOwn(content,'logo')&&!Object.hasOwn(content,'logoOriginal')&&!Object.hasOwn(content,'logoCutout')){content.logoOriginal=content.logo;content.logoCutout=null;}
  for(const key of MEDIA_KEYS)if(Object.hasOwn(content,key)&&content[key]!==null&&!Object.hasOwn(p.media||{},content[key]))throw Error('锁定素材引用无效');
  if(Object.hasOwn(content,'backgrounds')&&(!Array.isArray(content.backgrounds)||content.backgrounds.some(b=>!b||!Object.hasOwn(p.media||{},b.data))))throw Error('锁定背景引用无效');
 }
 if(!Object.hasOwn(p,'lockedGroups'))p.lockedGroups=[];
 if(!Array.isArray(p.lockedGroups)||new Set(p.lockedGroups).size!==p.lockedGroups.length||p.lockedGroups.some(g=>![...PRESET_GROUPS.map(g=>g.name),'自定义'].includes(g)))throw Error('编组锁定状态无效');
 if(!Object.hasOwn(p,'backgrounds'))p.backgrounds=[];
 if(!Object.hasOwn(p,'activeBackgroundId'))p.activeBackgroundId=null;
 if(!Object.hasOwn(p,'exportAllBackgrounds'))p.exportAllBackgrounds=false;
 if(!Object.hasOwn(p,'backgroundMode'))p.backgroundMode=p.exportAllBackgrounds?'all':'current';
 if(!Array.isArray(p.backgrounds)||!['matched','all','current'].includes(p.backgroundMode)||typeof p.exportAllBackgrounds!=='boolean')throw Error('背景列表或应用模式无效');
 const backgroundIds=new Set();
 for(const b of p.backgrounds){if(!b||typeof b.id!=='string'||!/^[-\w]{1,80}$/.test(b.id)||backgroundIds.has(b.id)||typeof b.name!=='string'||b.name.length>150||typeof b.data!=='string'||b.data.length>45000000||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(b.data))throw Error('背景素材或标识无效');if(Object.hasOwn(b,'width')||Object.hasOwn(b,'height')){if(!Number.isSafeInteger(b.width)||!Number.isSafeInteger(b.height)||b.width<1||b.height<1||b.width*b.height>24000000)throw Error('背景尺寸无效');}backgroundIds.add(b.id);}
 if(!checkContent&&p.activeBackgroundId!==null&&!backgroundIds.has(p.activeBackgroundId))throw Error('当前背景不存在');
 for(const k of MEDIA_KEYS){const a=p.assets[k];if(a!==null&&(typeof a!=='string'||a.length>45000000||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(a)))throw Error('项目素材必须是内嵌PNG或JPEG');}
 if(!checkContent&&p.source==='cutout'&&!p.assets.cutout)throw Error('项目缺少抠图素材');
 for(const k of ['title','subtitle','cta'])if(typeof p.copy[k]!=='string'||p.copy[k].length>2000)throw Error('文案长度或格式无效');
 const ids=new Set();
 for(const v of p.variants){
  if(!Object.hasOwn(v,'locked'))v.locked=false;
  if(typeof v.locked!=='boolean')throw Error('尺寸锁定状态无效');
  for(const field of ['imageScaleX','imageScaleY','logoScaleX','logoScaleY']){if(!Object.hasOwn(v,field))v[field]=1;if(!finite(v[field],.01,100))throw Error('图层缩放无效');}
  if(!Object.hasOwn(v,'feather'))v.feather=0;
  if(!Object.hasOwn(v,'backgroundPreference'))v.backgroundPreference=null;
  if(v.backgroundPreference!==null&&!contentFor(p,v).backgrounds.some(b=>b.id===v.backgroundPreference))throw Error('尺寸引用的背景不存在');
  if(!Object.hasOwn(v,'textLayers'))v.textLayers=defaultTextLayers();
  if(!v.textLayers||Array.isArray(v.textLayers)||typeof v.textLayers!=='object')throw Error('文字图层无效');
  for(const key of ['title','subtitle','cta']){const layer=v.textLayers[key];if(!layer||Array.isArray(layer)||typeof layer!=='object')throw Error('文字图层无效');
   for(const field of ['scaleX','scaleY','width','height','separatorEnabled','fontWeight','italic','underline','underlineColor','separatorColor','separatorWidth','separatorHeight'])if(!Object.hasOwn(layer,field))layer[field]=defaultTextLayer()[field];
   if(!finite(layer.scaleX,.01,100)||!finite(layer.scaleY,.01,100))throw Error('文字缩放无效');
   if(layer.width!==null&&!finite(layer.width,1,12000))throw Error('文字宽度无效');
   if(layer.height!==null&&!finite(layer.height,1,12000))throw Error('文字高度无效');
   if((layer.fontWeight!==null&&!finite(layer.fontWeight,100,900))||typeof layer.separatorEnabled!=='boolean'||typeof layer.italic!=='boolean'||!['none','straight','swoosh'].includes(layer.underline)||!color(layer.underlineColor)||!color(layer.separatorColor)||!finite(layer.separatorWidth,.1,30)||!finite(layer.separatorHeight,.1,1.5))throw Error('文字装饰样式无效');
   for(const [field,min,max]of [['dx',-12000,12000],['dy',-12000,12000],['strokeWidth',0,30],['shadowOpacity',0,1],['shadowBlur',0,100],['shadowX',-1000,1000],['shadowY',-1000,1000]])if(!finite(layer[field],min,max))throw Error('文字效果数值无效');
   if(layer.fontSize!==null&&!finite(layer.fontSize,4,1000))throw Error('文字字号无效');
   if((layer.color!==null&&!color(layer.color))||!color(layer.strokeColor)||!color(layer.shadowColor)||typeof layer.shadowEnabled!=='boolean')throw Error('文字效果样式无效');
  }

  for(const [key,value]of [['bgZoom',1],['bgX',.5],['bgY',.5]])if(!Object.hasOwn(v,key))v[key]=value;
  const temp=createProject();const valid=addVariant(temp,v.width,v.height);if(v.id!==valid.id||ids.has(v.id))throw Error('项目尺寸重复或无效');ids.add(v.id);
  for(const [key,min,max]of [['bgZoom',1,5],['bgX',0,1],['bgY',0,1],['feather',0,.5],['scale',.1,5],['dx',-12000,12000],['dy',-12000,12000],['fontSize',4,1000],['logoX',-6000,12000],['logoY',-6000,12000],['logoWidth',1,6000]])if(!finite(v[key],min,max))throw Error('项目布局数值无效');
  for(const [key,fields]of [['box',['x','y','w','h']],['text',['x','y','w']]])for(const f of fields)if(!v[key]||!finite(v[key][f],['w','h'].includes(f)?1:-12000,12000))throw Error('项目区域无效');
  if(typeof v.crop!=='boolean'||!['solid','gradient','transparent'].includes(v.background)||!color(v.color)||!color(v.color2)||!color(v.textColor)||!color(v.accent))throw Error('项目样式无效');
 }
 if(!checkContent)return p;
 const checked=new Set();for(const content of [...p.variants.map(v=>v.content||{}),p.sharedBaseline||{}]){const key=JSON.stringify(content);if(checked.has(key))continue;checked.add(key);validateProject({...contentFor(p,{content}),variants:[],media:undefined,sharedBaseline:undefined},false);}
 const serialized=JSON.stringify(p);if(serialized.length>MAX_PROJECT_BYTES||new TextEncoder().encode(serialized).byteLength>MAX_PROJECT_BYTES)throw Error('项目超过120 MB，请缩小素材后重试');
 return p;
}
export function validateBackgroundBatch(project,files){
 let encodedBytes=0;
 for(const file of files){if(!['image/png','image/jpeg'].includes(file.type)||!Number.isSafeInteger(file.size)||file.size<=0||file.size>32*1024*1024)throw Error(`${file.name}：请使用32 MB以内的PNG/JPEG`);encodedBytes+=4*Math.ceil(file.size/3)+22;}
 if(new TextEncoder().encode(JSON.stringify(project)).byteLength+encodedBytes>MAX_PROJECT_BYTES)throw Error('加入这批背景后项目将超过120 MB，请减少数量或缩小文件');
}
