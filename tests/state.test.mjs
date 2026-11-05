import test from 'node:test';
import assert from 'node:assert/strict';
const m = await import('../web/state.js').catch(() => ({}));
test('extreme contain keeps complete image in its assigned region',()=>{
 assert.equal(typeof m.imageRect,'function');
 const r=m.imageRect(600,900,{x:0,y:0,w:40,h:50},1,0,0);assert.ok(Math.abs(r.w-33.333333333333336)<1e-10);assert.ok(r.x>=0&&r.x+r.w<=40);assert.equal(r.h,50);assert.equal(r.y,0);
});
test('editing one variant leaves other variants intact',()=>{
 assert.equal(typeof m.createProject,'function');
 const p=m.createProject(); m.addVariant(p,300,250);m.addVariant(p,970,90);
 const before=structuredClone(p.variants[0]);m.updateVariant(p,p.variants[1].id,{scale:1.5});
 assert.deepEqual(p.variants[0],before);assert.equal(p.variants[1].scale,1.5);
});
test('project roundtrips embedded images and rejects invalid input before mutation',()=>{
 assert.equal(typeof m.validateProject,'function');
 const p=m.createProject();p.assets.original='data:image/png;base64,aGVsbG8=';m.addVariant(p,300,250);
 assert.deepEqual(m.validateProject(JSON.parse(JSON.stringify(p))),p);
 for(const corrupt of [{...p,version:99},{...p,variants:[{...p.variants[0],width:0}]},{...p,assets:{...p.assets,original:'https://evil.test/x.png'}},{...p,variants:[{...p.variants[0],scale:Infinity}]}])assert.throws(()=>m.validateProject(corrupt));
});
test('size limits prevent unbounded canvas allocations and duplicates',()=>{
 assert.equal(typeof m.addVariant,'function');const p=m.createProject();
 assert.throws(()=>m.addVariant(p,9000,9000));m.addVariant(p,300,250);assert.throws(()=>m.addVariant(p,300,250));
});
test('position normalizer keeps drag values within savable project bounds',()=>{
 assert.equal(typeof m.clampPosition,'function');
 assert.equal(m.clampPosition(-20000),-12000);assert.equal(m.clampPosition(99999),12000);assert.equal(m.clampPosition(12.5),12.5);
});
test('feather is independent per size and defaults safely for legacy projects',()=>{
 const p=m.createProject();const a=m.addVariant(p,300,250),b=m.addVariant(p,970,90);
 assert.equal(a.feather,0);m.updateVariant(p,a.id,{feather:.2});assert.equal(b.feather,0);
 const restored=m.validateProject(JSON.parse(JSON.stringify(p)));assert.equal(restored.variants[0].feather,.2);
 delete p.variants[0].feather;const migrated=m.validateProject(p);assert.equal(migrated.variants[0].feather,0);assert.equal(Object.hasOwn(p.variants[0],'feather'),false);
 for(const value of [null,-.1,.51,Infinity,'0.2']){p.variants[0].feather=value;assert.throws(()=>m.validateProject(p));}
});
test('all screenshot presets are grouped, unique, and keep existing custom sizes',()=>{
 assert.equal(m.PRESETS.length,38);assert.equal(new Set(m.PRESETS.map(a=>a.join('x'))).size,38);
 assert.deepEqual(m.PRESET_GROUPS.map(g=>g.sizes.length),[9,9,3,5,12]);
 const p=m.createProject();m.addVariant(p,800,800);m.addAllPresets(p);assert.equal(p.variants.length,39);assert.ok(p.variants.some(v=>v.id==='800x800'));m.addAllPresets(p);assert.equal(p.variants.length,39);
 const full=m.createProject();m.addVariant(full,801,800);m.addVariant(full,802,800);m.addVariant(full,803,800);const before=structuredClone(full);assert.throws(()=>m.addAllPresets(full));assert.deepEqual(full,before);
});
test('background collection roundtrips and rejects dangling references and bad inactive assets',()=>{
 const p=m.createProject();m.addVariant(p,300,250);assert.deepEqual(p.backgrounds,[]);assert.equal(p.activeBackgroundId,null);
 p.backgrounds=[{id:'bg1',name:'背景.png',data:'data:image/png;base64,aGVsbG8='}];p.activeBackgroundId='bg1';p.variants[0].bgZoom=1.5;
 assert.deepEqual(m.validateProject(p),p);
 const legacy=structuredClone(p);delete legacy.backgrounds;delete legacy.activeBackgroundId;delete legacy.variants[0].bgZoom;delete legacy.variants[0].bgX;delete legacy.variants[0].bgY;const upgraded=m.validateProject(legacy);assert.deepEqual(upgraded.backgrounds,[]);assert.equal(upgraded.variants[0].bgZoom,1);
 for(const edit of [q=>q.activeBackgroundId='missing',q=>q.backgrounds.push({...q.backgrounds[0]}),q=>q.backgrounds.push({id:'bad',name:'bad',data:'https://bad.test/x'}),q=>q.variants[0].bgX=1.1]){const q=structuredClone(p);edit(q);assert.throws(()=>m.validateProject(q));}
});
test('background batch rejects excessive metadata size before reading any file bytes',()=>{
 assert.equal(typeof m.validateBackgroundBatch,'function');const p=m.createProject();const before=structuredClone(p);
 const large=Array.from({length:3},()=>({name:'large.png',type:'image/png',size:32*1024*1024}));assert.throws(()=>m.validateBackgroundBatch(p,large),/120 MB/);assert.deepEqual(p,before);
 assert.doesNotThrow(()=>m.validateBackgroundBatch(p,[{name:'small.png',type:'image/png',size:100}]));
 assert.throws(()=>m.validateBackgroundBatch(p,[{name:'bad.txt',type:'text/plain',size:1}]));assert.throws(()=>m.validateBackgroundBatch(p,[{name:'big.png',type:'image/png',size:33*1024*1024}]));
});
test('slender landscape sizes share banner previews rather than landscape previews',async()=>{
 const {previewGroup}=await import('../web/preview-groups.js');const p=m.createProject();
 for(const [w,h]of [[750,200],[750,300],[970,250],[320,100],[1200,600]])m.addVariant(p,w,h);
 const group=previewGroup(p,'750x200');assert.equal(group.name,'横幅');assert.deepEqual(new Set(group.variants.map(v=>v.id)),new Set(['750x300','970x250','320x100']));
 assert.equal(previewGroup(p,'1200x600').name,'横版');
});

test('every preset follows symmetric aspect-ratio groups across previews and group locks',async()=>{
 const {previewGroup}=await import('../web/preview-groups.js'),{groupName}=await import('../web/locks.js');
 const p=m.createProject();m.addAllPresets(p);
 for(const v of p.variants){
  const w=v.width,h=v.height;
  const expected=Math.max(w,h)*4<=Math.min(w,h)*5?'方形':w>h?(w*2>=h*5?'横幅':'横版'):(h*2>=w*5?'窄竖版':'竖版');
  assert.equal(groupName(v),expected,`${v.id} lock group`);
  const preview=previewGroup(p,v.id);assert.equal(preview.name,expected,`${v.id} preview group`);
  assert.equal(preview.variants.length,p.variants.filter(other=>groupName(other)===expected).length-1,`${v.id} peer count`);
  for(const other of preview.variants)assert.equal(groupName(other),expected,`${v.id} must not mix ${other.id}`);
 }
 for(const [w,h]of [[800,800],[1000,100]]){
  const custom=m.addVariant(p,w,h);const expected=w===h?'方形':'横幅';assert.equal(groupName(custom),expected);assert.equal(previewGroup(p,custom.id).name,expected);
 }
});
test('near-square landscape and portrait presets share the compact composition group',async()=>{
 const {groupName,sameEditDomain,setGroupLock,setSizeLock}=await import('../web/locks.js');
 const p=m.createProject();for(const s of [[300,250],[336,280],[720,900],[1080,1350],[580,400],[600,900],[1440,1080]])m.addVariant(p,...s);
 for(const v of p.variants.slice(0,4))assert.equal(groupName(v),'方形',v.id);
 setGroupLock(p,'方形',true);assert.equal(sameEditDomain(p,p.variants[0],p.variants[2]),true);
 for(const v of p.variants.slice(4))assert.equal(sameEditDomain(p,p.variants[0],v),false);
 setSizeLock(p,p.variants[2],true);assert.equal(sameEditDomain(p,p.variants[0],p.variants[2]),false);
});
test('custom sizes use the same approximate aspect bands at every boundary',async()=>{
 const {groupName}=await import('../web/locks.js'),{previewGroup}=await import('../web/preview-groups.js');
 const cases=[[1000,1000,'方形'],[1250,1000,'方形'],[1000,1250,'方形'],[1251,1000,'横版'],[1000,1251,'竖版'],[2499,1000,'横版'],[2500,1000,'横幅'],[1000,2499,'竖版'],[1000,2500,'窄竖版']];
 for(const [w,h,name]of cases){const p=m.createProject(),v=m.addVariant(p,w,h);assert.equal(groupName(v),name,v.id);assert.equal(previewGroup(p,v.id).name,name);}
});
