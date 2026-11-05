import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,addVariant,validateProject} from '../web/state.js';
import {editShared,contentFor} from '../web/shared-content.js';
import {resolvedTextStyle} from '../web/text-layout.js';
import * as sync from '../web/size-sync.js';
const apply=(p,id)=>{assert.equal(typeof sync.syncGroupFromVariant,'function');return sync.syncGroupFromVariant(p,id);};
function setup(){const p=createProject(),a=addVariant(p,300,250),b=addVariant(p,600,500),c=addVariant(p,720,900),other=addVariant(p,600,900);return{p,a,b,c,other};}
test('完整覆盖源状态并按目标尺寸适配，默认样式清除旧值，重复点击不叠加',()=>{
 const {p,a,b,c,other}=setup();a.dx=15;a.dy=-10;a.scale=1.8;a.textLayers.title.fontSize=25;a.textLayers.title.shadowEnabled=true;a.textLayers.title.strokeWidth=2;a.logoWidth=40;a.color='#abcdef';b.dx=999;b.textLayers.subtitle.fontWeight=900;b.textLayers.subtitle.color='#ff0000';const source=structuredClone(a),outside=structuredClone(other);
 assert.deepEqual(apply(p,a.id),[b.id,c.id]);assert.equal(b.dx,30);assert.equal(b.dy,-20);assert.equal(b.logoWidth,80);assert.equal(b.textLayers.title.fontSize,50);assert.equal(b.textLayers.title.strokeWidth,4);assert.equal(b.textLayers.subtitle.fontWeight,400);assert.equal(b.textLayers.subtitle.color,resolvedTextStyle(a,'subtitle').color);assert.equal(c.dx,36);assert.equal(c.textLayers.title.fontSize,72);assert.deepEqual(a,source);assert.deepEqual(other,outside);
 const once=structuredClone(p);apply(p,a.id);assert.deepEqual(p,once);assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
});
test('不跨形状组，保留单尺寸锁、组锁以及旧自定义隔离',()=>{
 const {p,a,b,c,other}=setup();b.locked=true;p.lockedGroups=['方形'];const saved=structuredClone(b);assert.deepEqual(apply(p,a.id),[c.id]);assert.deepEqual(b,saved);a.locked=true;assert.deepEqual(apply(p,a.id),[]);
 a.locked=false;b.locked=false;p.lockedGroups=['自定义'];assert.deepEqual(apply(p,a.id),[c.id]);const custom=addVariant(p,601,501),customOther=addVariant(p,800,801),tall=addVariant(p,601,901);assert.deepEqual(apply(p,custom.id),[b.id,customOther.id]);assert.equal(other.dx,0);assert.equal(tall.dx,0);
});
test('只复制有效素材和文案，不改变根、其他尺寸或独立背景配置',()=>{
 const {p,a,b,c,other}=setup();const png='data:image/png;base64,AAAA';editShared(p,a,{original:png,logo:png,title:'已修改'},false);b.background='gradient';b.bgX=.2;b.bgY=.3;b.bgZoom=2;
 const bg={id:'local',name:'独立背景',width:600,height:500,data:png};editShared(p,b,{backgrounds:[bg],backgroundMode:'current',activeBackgroundId:'local'},false);b.backgroundPreference='local';const root=structuredClone({assets:p.assets,copy:p.copy,baseline:p.sharedBaseline,backgrounds:p.backgrounds}),outside=structuredClone({assets:contentFor(p,other).assets,copy:contentFor(p,other).copy,variant:other}),background=structuredClone(b.content.backgrounds);
 apply(p,a.id);for(const target of [b,c]){const content=contentFor(p,target);assert.equal(content.assets.original,png);assert.equal(content.assets.logo,png);assert.equal(content.copy.title,'已修改');}
 assert.deepEqual(b.content.backgrounds,background);assert.equal(b.backgroundPreference,'local');assert.equal(b.bgX,.2);assert.equal(b.bgY,.3);assert.equal(b.bgZoom,2);assert.equal(contentFor(p,b).activeBackgroundId,'local');assert.deepEqual({assets:contentFor(p,other).assets,copy:contentFor(p,other).copy,variant:other},outside);assert.deepEqual({assets:p.assets,copy:p.copy,baseline:p.sharedBaseline,backgrounds:p.backgrounds},root);validateProject(p);
});
test('最大尺寸差及最小效果符合项目数值限制',()=>{
 const p=createProject(),a=addVariant(p,24,24),b=addVariant(p,4000,4000);a.logoWidth=6000;a.dx=12000;a.textLayers.title.fontSize=1000;a.textLayers.title.shadowX=1000;apply(p,a.id);validateProject(p);assert.equal(b.dx,12000);assert.equal(b.logoWidth,6000);assert.equal(b.textLayers.title.fontSize,1000);
});
