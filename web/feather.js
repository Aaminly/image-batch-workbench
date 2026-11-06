// One raster is reused across pointer moves; it never exceeds the output canvas.
const cache={image:null,key:'',canvas:null};
function intersection(a,b){const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y);return {x,y,w:Math.min(a.x+a.w,b.x+b.w)-x,h:Math.min(a.y+a.h,b.y+b.h)-y};}
export function drawFeathered(ctx,image,rect,crop,amount=0,bounds={width:ctx.canvas.width,height:ctx.canvas.height},featherRect=rect){
 if(amount===0){ctx.drawImage(image,rect.x,rect.y,rect.w,rect.h);return;}
 const area=crop?intersection(featherRect,crop):featherRect;
 let visible=intersection(intersection(area,rect),{x:bounds.x??0,y:bounds.y??0,w:bounds.width,h:bounds.height});
 if(visible.w<=0||visible.h<=0)return;
 const transform=ctx.getTransform(),sx=Math.abs(transform.a),sy=Math.abs(transform.d);
 // Share the output pixel grid so a cropped layer samples like its full-size source.
 const left=(Math.floor(visible.x*sx+transform.e)-transform.e)/sx,top=(Math.floor(visible.y*sy+transform.f)-transform.f)/sy;
 visible={x:left,y:top,w:(Math.ceil((visible.x+visible.w)*sx+transform.e)-transform.e)/sx-left,h:(Math.ceil((visible.y+visible.h)*sy+transform.f)-transform.f)/sy-top};
 const width=Math.ceil(visible.w*sx),height=Math.ceil(visible.h*sy);
 const relative={x:rect.x-visible.x,y:rect.y-visible.y,ax:area.x-visible.x,ay:area.y-visible.y};
 const key=JSON.stringify([width,height,visible.w,visible.h,rect.w,rect.h,area.w,area.h,relative,amount]);
 if(cache.image!==image||cache.key!==key){
  const layer=cache.canvas||(cache.canvas=document.createElement('canvas'));if(layer.width!==width)layer.width=width;if(layer.height!==height)layer.height=height;
  const c=layer.getContext('2d');c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation='source-over';c.clearRect(0,0,width,height);c.setTransform(width/visible.w,0,0,height/visible.h,0,0);c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
  c.drawImage(image,relative.x,relative.y,rect.w,rect.h);
  c.globalCompositeOperation='destination-in';
  const radius=Math.min(area.w,area.h)*amount;
  for(const [x0,y0,x1,y1,span] of [[relative.ax,0,relative.ax+area.w,0,area.w],[0,relative.ay,0,relative.ay+area.h,area.h]]){
   const g=c.createLinearGradient(x0,y0,x1,y1);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(radius/span,'rgba(0,0,0,1)');g.addColorStop(1-radius/span,'rgba(0,0,0,1)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(0,0,visible.w,visible.h);
  }
  cache.image=image;cache.key=key;
 }
 ctx.drawImage(cache.canvas,visible.x,visible.y,visible.w,visible.h);
}
