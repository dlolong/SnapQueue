import type { DesignElement,DesignModel } from "./model";

export function orderPhotoSlots(elements: DesignElement[]): DesignElement[] {
 return elements.map((element,index)=>({element,index})).filter(item=>item.element.type==="photo")
  .sort((a,b)=>((a.element.slotNumber??a.index+1)-(b.element.slotNumber??b.index+1))||a.index-b.index)
  .map((item,zIndex)=>({...item.element,zIndex}));
}

export function renderDesign(
 ctx:CanvasRenderingContext2D,
 design:DesignModel,
 photos:Record<string,CanvasImageSource>={},
 overlay?:CanvasImageSource,
 options:{showPhotoPlaceholders?:boolean}={}
){
 const {width,height,background}=design.canvas;
 ctx.save();ctx.clearRect(0,0,width,height);ctx.fillStyle=background;ctx.fillRect(0,0,width,height);
 const visible=design.elements.filter(e=>e.visible);
 for(const el of orderPhotoSlots(visible))drawElement(ctx,el,photos,options.showPhotoPlaceholders!==false);
 for(const el of visible.filter(e=>e.type!=="photo").sort((a,b)=>a.zIndex-b.zIndex))drawElement(ctx,el,photos,options.showPhotoPlaceholders!==false);
 if(overlay&&design.overlay){const o=design.overlay;ctx.save();ctx.translate(o.x+o.displayWidth/2,o.y+o.displayHeight/2);ctx.rotate(o.rotation*Math.PI/180);ctx.drawImage(overlay,-o.displayWidth/2,-o.displayHeight/2,o.displayWidth,o.displayHeight);ctx.restore();}
 ctx.restore();
}

export function drawElement(ctx:CanvasRenderingContext2D,e:DesignElement,photos:Record<string,CanvasImageSource>={},showPhotoPlaceholder=true){
 ctx.save();ctx.translate(e.x+e.width/2,e.y+e.height/2);ctx.rotate((e.rotation||0)*Math.PI/180);const x=-e.width/2,y=-e.height/2;
 if(e.type==="photo"){
  const img=e.photoId?photos[e.photoId]:undefined;
  if(img){
   const iw="naturalWidth" in img?Number(img.naturalWidth):Number((img as HTMLVideoElement).videoWidth)||Number((img as HTMLCanvasElement).width);
   const ih="naturalHeight" in img?Number(img.naturalHeight):Number((img as HTMLVideoElement).videoHeight)||Number((img as HTMLCanvasElement).height);
   if(iw>0&&ih>0){
    const scale=e.fit==="contain"?Math.min(e.width/iw,e.height/ih):Math.max(e.width/iw,e.height/ih);
    if(e.fit==="contain"){const dw=iw*scale,dh=ih*scale;ctx.drawImage(img,x+(e.width-dw)/2,y+(e.height-dh)/2,dw,dh);}
    else{const sw=e.width/scale,sh=e.height/scale,maxX=Math.max(0,iw-sw),maxY=Math.max(0,ih-sh),cx=Math.min(1,Math.max(0,e.cropX??.5)),cy=Math.min(1,Math.max(0,e.cropY??.5));ctx.drawImage(img,maxX*cx,maxY*cy,sw,sh,x,y,e.width,e.height);}
   }
  }else if(showPhotoPlaceholder){ctx.fillStyle="#e9e9ee";ctx.fillRect(x,y,e.width,e.height);ctx.strokeStyle="#b9bac5";ctx.strokeRect(x,y,e.width,e.height);}
 }
 else if(e.type==="shape"){ctx.fillStyle=e.background||e.color||"#eeeeee";ctx.fillRect(x,y,e.width,e.height);}
 else{ctx.fillStyle=e.color||"#222222";ctx.font=`${e.fontSize||48}px Arial, sans-serif`;ctx.textAlign=e.align||"left";ctx.textBaseline="middle";const tx=e.align==="center"?0:e.align==="right"?e.width/2:-e.width/2;ctx.fillText(e.text||"Text",tx,0,e.width);}
 ctx.restore();
}
