import {imageRect,clampPosition} from './state.js';
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export const TEXT_IDS=['title','subtitle','cta'];
export function mediaRect(v,id,image){
 if(id==='logo')return{x:v.logoX,y:v.logoY,w:v.logoWidth*(v.logoScaleX??1),h:v.logoWidth*image.height/image.width*(v.logoScaleY??1)};
 const b=imageRect(image.width,image.height,v.box,v.scale,0,0),w=b.w*(v.imageScaleX??1),h=b.h*(v.imageScaleY??1);
 const r={x:v.box.x+(v.box.w-w)/2+v.dx,y:v.box.y+(v.box.h-h)/2+v.dy,w,h};
 if(!v.crop){const fit=Math.min(1,v.width/r.w,v.height/r.h);r.w*=fit;r.h*=fit;}return r;
}
export function resizeLayer(v,id,start,frame,side,dx,dy,assets={}){
 const reject=()=>{Object.assign(v,structuredClone(start));return {...frame};};
 const text=TEXT_IDS.includes(id),image=id==='image',old=text?start.textLayers[id]:null;
 let sx=text?(old.scaleX??1):id==='logo'?(start.logoScaleX??1):1,sy=text?(old.scaleY??1):id==='logo'?(start.logoScaleY??1):1;
 let baseW=frame.w/sx,baseH=frame.h/sy;
 if(image){const src=assets.image||assets.original||assets.cutout;if(!src)throw Error('缺少图片尺寸，无法调整图层');const b=imageRect(src.width,src.height,start.box,start.scale,0,0);baseW=b.w;baseH=b.h;sx=frame.w/baseW;sy=frame.h/baseH;}
 const west=side.includes('w'),east=side.includes('e'),north=side.includes('n'),south=side.includes('s'),horizontal=west||east,vertical=north||south,boxEdit=text&&side.length===1;
 let w=frame.w,h=frame.h;
 if(boxEdit){if(horizontal)w=clamp((frame.w+(west?-dx:dx))/sx,1,12000)*sx;if(vertical)h=clamp((frame.h+(north?-dy:dy))/sy,1,12000)*sy;}
 else{
  const vx=west?-frame.w:east?frame.w:0,vy=north?-frame.h:south?frame.h:0;
  let factor=1+(dx*vx+dy*vy)/(vx*vx+vy*vy);
  const min=Math.max(.01/sx,.01/sy,1/frame.w,1/frame.h),max=Math.min(100/sx,100/sy,12000/frame.w,12000/frame.h,image&&!start.crop?start.width/frame.w:Infinity,image&&!start.crop?start.height/frame.h:Infinity);
  if(max<min)return reject();factor=clamp(factor,min,max);w*=factor;h*=factor;
 }
 const r={x:west?frame.x+frame.w-w:east?frame.x:frame.x+(frame.w-w)/2,y:north?frame.y+frame.h-h:south?frame.y:frame.y+(frame.h-h)/2,w,h};
 if(text){
  v.textLayers=structuredClone(start.textLayers);const l=v.textLayers[id];
  if(boxEdit){if(horizontal)l.width=w/sx;if(vertical)l.height=h/sy;}else{l.scaleX=clamp(w/baseW,.01,100);l.scaleY=clamp(h/baseH,.01,100);}
  l.dx=old.dx+r.x-frame.x;l.dy=old.dy+r.y-frame.y;
  if(l.dx!==clampPosition(l.dx)||l.dy!==clampPosition(l.dy)||!preserveTextPositions(v,start,id,assets.layout)){return reject();}
  return assets.layout?.(v).find(l=>l.id===id)?.frameRect||r;
 }
 if(image){const x=r.x-start.box.x-start.box.w/2+w/2,y=r.y-start.box.y-start.box.h/2+h/2;if(x!==clampPosition(x)||y!==clampPosition(y))return reject();v.imageScaleX=clamp(w/baseW,.01,100);v.imageScaleY=clamp(h/baseH,.01,100);v.dx=x;v.dy=y;return mediaRect(v,'image',assets.image||assets.original||assets.cutout);}
 if(r.x!==clampPosition(r.x,-6000)||r.y!==clampPosition(r.y,-6000))return reject();v.logoScaleX=clamp(w/baseW,.01,100);v.logoScaleY=clamp(h/baseH,.01,100);v.logoX=r.x;v.logoY=r.y;return r;
}
export function preserveTextPositions(v,start,id,layout){
 if(!layout)return true;
 const before=layout(start),after=layout(v);
 for(const layer of after){if(layer.id===id)continue;const old=before.find(l=>l.id===layer.id);if(!old)continue;const target=v.textLayers[layer.id],dy=target.dy+old.origin.y-layer.origin.y;if(dy!==clampPosition(dy))return false;target.dy=dy;}
 return true;
}
