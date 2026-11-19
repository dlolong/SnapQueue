export function validateDesign(value){
 if(!value||typeof value!=="object")return false;
 const x=value,c=x.canvas,o=x.overlay;
 if(![1,2].includes(x.version)||!Number.isInteger(c?.width)||!Number.isInteger(c?.height)||c.width<=0||c.width>5000||c.height<=0||c.height>5000||!Number.isInteger(c.dpi)||c.dpi<72||c.dpi>1200||!Array.isArray(x.elements)||x.elements.length>200)return false;
 if(!x.elements.every(e=>e&&typeof e.id==="string"&&["photo","text","shape"].includes(e.type)&&[e.x,e.y,e.width,e.height,e.rotation,e.zIndex].every(Number.isFinite)&&e.width>=1&&e.height>=1&&e.width<=5000&&e.height<=5000))return false;
 if(x.guest!==undefined&&(!x.guest||!Number.isInteger(x.guest.maxPhotosPerGuest)||x.guest.maxPhotosPerGuest<1||x.guest.maxPhotosPerGuest>20))return false;
 if(o!==undefined&&(!o||typeof o.path!=="string"||!o.path.length||![o.width,o.height,o.x,o.y,o.displayWidth,o.displayHeight,o.rotation].every(Number.isFinite)||o.width<1||o.height<1||o.displayWidth<1||o.displayHeight<1||typeof o.locked!=="boolean"))return false;
 return true;
}
