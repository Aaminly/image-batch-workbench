import {elementFor} from './elements.js';
import {defaultTextLayers} from './state.js';
import {contentFor} from './shared-content.js';
export const FONT='"PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
export function unionRects(rects){if(!rects.length)return {x:0,y:0,w:0,h:0};const x=Math.min(...rects.map(r=>r.x)),y=Math.min(...rects.map(r=>r.y));return{x,y,w:Math.max(...rects.map(r=>r.x+r.w))-x,h:Math.max(...rects.map(r=>r.y+r.h))-y};}
function wrap(ctx,text,width){return text.split('\n').flatMap(paragraph=>{if(!paragraph)return [''];let line='';const lines=[];for(const char of paragraph){if(line&&ctx.measureText(line+char).width>width){lines.push(line);line='';}line+=char;}lines.push(line);return lines;});}
export function resolvedTextStyle(v,id){const added=elementFor(v,id);if(added)return {...resolvedTextStyle({...v,elements:[],textLayers:{...v.textLayers,[added.type==='button'?'cta':'title']:added.style}},added.type==='button'?'cta':'title'),dx:added.x,dy:added.y};const layer=v.textLayers?.[id]||defaultTextLayers()[id];const base=id==='title'?v.fontSize:Math.max(4,v.fontSize*(id==='subtitle'?.48:.5));return{...defaultTextLayers()[id],...layer,width:layer.width??v.text.w,fontWeight:layer.fontWeight??(id==='title'?650:id==='cta'?600:400),fontSize:layer.fontSize??base,color:layer.color??(id==='cta'?'#111820':v.textColor)};}
export function layoutText(ctx,project,v,includeAdded=true){
 project=contentFor(project,v);
 let y=v.text.y;const layers=[];ctx.textBaseline='top';
 for(const id of ['title','subtitle','cta']){
  if(!project.copy[id])continue;
  const style=resolvedTextStyle(v,id),size=style.fontSize,weight=style.fontWeight,font=`${style.italic?'italic ':''}${weight} ${size}px ${FONT}`;ctx.font=font;
  const padding=id==='cta'?size*.6:0,width=Math.max(1,style.width-padding*2),texts=wrap(ctx,project.copy[id],width),step=size*(id==='cta'?1.25:1.22)+(style.underline!=='none'?size*.18:0);
  const x=v.text.x+style.dx,top=y+style.dy,lines=texts.map((text,i)=>({text,x:x+padding,y:top+padding+i*step,w:ctx.measureText(text).width,h:step}));
  const naturalHeight=lines.length*step+padding*2,frameHeight=style.height??naturalHeight;
  const button=id==='cta'?{x,y:top,w:Math.min(style.width,Math.max(...lines.map(l=>l.w))+padding*2),h:frameHeight}:null;
  if(button){const inkLines=lines.filter(l=>l.text.trim());if(inkLines.length){const tops=inkLines.map(l=>l.y-ctx.measureText(l.text).actualBoundingBoxAscent),bottoms=inkLines.map(l=>l.y+ctx.measureText(l.text).actualBoundingBoxDescent);const delta=button.y+button.h/2-(Math.min(...tops)+Math.max(...bottoms))/2;for(const line of lines)line.y+=delta;}}
  const decorations=style.underline==='none'?[]:lines.filter(l=>l.text.trim()).map(l=>style.underline==='swoosh'?{x:l.x+l.w*.04,y:l.y+ctx.measureText(l.text).actualBoundingBoxDescent+size*.1,w:l.w*.92,h:size*.18}:{x:l.x,y:l.y+size*1.12,w:l.w,h:size*.12});
  for(const line of lines){let x=line.x;const m=ctx.measureText(line.text);line.runs=(style.separatorEnabled?line.text.split(/([|｜])/):[line.text]).map(text=>{const w=ctx.measureText(text).width,separator=style.separatorEnabled&&['|','｜'].includes(text)?{x:x+(w-style.separatorWidth)/2,y:line.y+(m.actualBoundingBoxDescent-m.actualBoundingBoxAscent-size*style.separatorHeight)/2,w:style.separatorWidth,h:size*style.separatorHeight}:null;const run={text,x,w,separator};x+=w;return run;});}
  const separators=lines.flatMap(l=>l.runs.filter(r=>r.separator).map(r=>r.separator));
  const glyphs=lines.map(l=>{const m=ctx.measureText(l.text);return{x:l.x-Math.max(0,m.actualBoundingBoxLeft),y:l.y-m.actualBoundingBoxAscent,w:Math.max(l.w,m.actualBoundingBoxRight)+Math.max(0,m.actualBoundingBoxLeft),h:m.actualBoundingBoxAscent+m.actualBoundingBoxDescent};});
  const decorationBounds=decorations.map(d=>style.underline==='swoosh'?{x:d.x-1,y:d.y-1,w:d.w+2,h:d.h+2}:d);
  const ink=unionRects([...lines,...glyphs,...decorationBounds,...separators]),scaleX=style.scaleX,scaleY=style.scaleY;
  const map=r=>({x:x+(r.x-x)*scaleX,y:top+(r.y-top)*scaleY,w:r.w*scaleX,h:r.h*scaleY});
  const mapped=map(ink),strokeX=style.strokeWidth*scaleX/2,strokeY=style.strokeWidth*scaleY/2,hasShadow=style.shadowEnabled&&style.shadowOpacity>0;
  const matrix=ctx.getTransform(),px=Math.abs(matrix.a)||1,py=Math.abs(matrix.d)||1,blur=hasShadow?style.shadowBlur*(px*scaleX+py*scaleY):0;
  const left=hasShadow?Math.min(0,style.shadowX*scaleX-blur/px):0,right=hasShadow?Math.max(0,style.shadowX*scaleX+blur/px):0,up=hasShadow?Math.min(0,style.shadowY*scaleY-blur/py):0,down=hasShadow?Math.max(0,style.shadowY*scaleY+blur/py):0;
  const painted={x:mapped.x-strokeX+left,y:mapped.y-strokeY+up,w:mapped.w+strokeX*2+right-left,h:mapped.h+strokeY*2+down-up};
  const warnings=[];if(naturalHeight>frameHeight+.1)warnings.push('文字超出文本框');if(lines.some(l=>l.w>width+.1))warnings.push(id==='cta'?'按钮文字超过指定宽度':'文字超过指定宽度');if(size<12)warnings.push('文字字号偏小，请检查最终尺寸的可读性');
  layers.push({id,style,font,lines,decorations,button,origin:{x,y:top},frameRect:map({x,y:top,w:style.width,h:frameHeight}),rect:button?unionRects([painted,map(button)]):painted,hitRects:(button?[button,...glyphs,...decorationBounds,...separators]:[...glyphs,...decorationBounds,...separators]).filter(l=>l.w>0).map(map),warnings});
  y+=frameHeight+(button?0:v.fontSize*.25);
 }
 if(includeAdded)for(const element of v.elements||[]){
  if(element.type==='image')continue;
  const id=element.type==='button'?'cta':'title',copy={title:'',subtitle:'',cta:'',[id]:element.text},own={...v,content:undefined,elements:[],text:{x:element.x,y:element.y,w:v.width*.6},textLayers:{...v.textLayers,[id]:element.style}};
  const layer=layoutText(ctx,{...project,copy},own,false)[0];if(layer)layers.push({...layer,id:element.id,accent:element.accent});
 }
 return layers;
}
function shadowColor(hex,opacity){return `rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${opacity})`;}
export function paintText(ctx,layers,accent){
 for(const layer of layers){
  ctx.save();const origin=layer.origin||{x:0,y:0};ctx.translate(origin.x,origin.y);ctx.scale(layer.style.scaleX??1,layer.style.scaleY??1);ctx.translate(-origin.x,-origin.y);
  const transform=ctx.getTransform(),sx=Math.abs(transform.a),sy=Math.abs(transform.d);
  if(layer.button){ctx.save();ctx.shadowColor='transparent';ctx.fillStyle=layer.accent??accent;const b=layer.button;ctx.beginPath();ctx.roundRect(b.x,b.y,b.w,b.h,Math.min(6,layer.style.fontSize*.3));ctx.fill();ctx.restore();}
  ctx.save();ctx.textBaseline='top';ctx.font=layer.font;ctx.fillStyle=layer.style.color;ctx.lineJoin='round';
  const style=layer.style;if(style.shadowEnabled){ctx.shadowColor=shadowColor(style.shadowColor,style.shadowOpacity);ctx.shadowBlur=style.shadowBlur*(sx+sy)/2;ctx.shadowOffsetX=style.shadowX*sx;ctx.shadowOffsetY=style.shadowY*sy;}
  if(style.strokeWidth>0){ctx.strokeStyle=style.strokeColor;ctx.lineWidth=style.strokeWidth;for(const line of layer.lines)for(const run of line.runs)if(!run.separator)ctx.strokeText(run.text,run.x,line.y);}
  for(const line of layer.lines)for(const run of line.runs){if(run.separator){ctx.save();ctx.shadowColor='transparent';ctx.fillStyle=style.separatorColor;const r=run.separator;ctx.fillRect(r.x,r.y,r.w,r.h);ctx.restore();}else ctx.fillText(run.text,run.x,line.y);}
  ctx.shadowColor='transparent';ctx.fillStyle=style.underlineColor;
  for(const d of layer.decorations){if(style.underline==='straight')ctx.fillRect(d.x,d.y,d.w,Math.max(1,d.h*.3));else paintSwoosh(ctx,d,style.underlineColor,sx,sy);}

  ctx.restore();ctx.restore();
 }
}

let swooshSurface;
function paintSwoosh(ctx,d,color,sx,sy){
 // Supersample only the decoration; cap scratch memory for very wide text.
 const pad=2,density=Math.min(4*Math.max(sx,sy),Math.sqrt(2000000/((d.w+pad*2)*(d.h+pad*2))));
 swooshSurface??=document.createElement('canvas');const canvas=swooshSurface;
 canvas.width=Math.max(1,Math.ceil((d.w+pad*2)*density));canvas.height=Math.max(1,Math.ceil((d.h+pad*2)*density));
 const c=canvas.getContext('2d');c.setTransform(canvas.width/(d.w+pad*2),0,0,canvas.height/(d.h+pad*2),0,0);c.translate(pad,pad);c.fillStyle=color;c.filter=`blur(${density*.35}px)`;
 c.beginPath();c.moveTo(0,d.h);c.bezierCurveTo(d.w*.32,-d.h/3,d.w*.68,-d.h/3,d.w,d.h);c.bezierCurveTo(d.w*.68,d.h*.4,d.w*.32,d.h*.4,0,d.h);c.closePath();c.fill();
 ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(canvas,d.x-pad,d.y-pad,d.w+pad*2,d.h+pad*2);ctx.restore();
}
