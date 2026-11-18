import { validateDesign } from "./validation.mjs";
export type DesignElement = { id:string; type:"photo"|"text"|"shape"; x:number;y:number;width:number;height:number;rotation:number;zIndex:number;visible:boolean;locked:boolean;photoId?:string;name?:string;required?:boolean;slotNumber?:number;lockAspectRatio?:boolean;cropX?:number;cropY?:number;text?:string;color?:string;background?:string;fit?:"cover"|"contain";fontSize?:number;align?:"left"|"center"|"right" };
export type OverlayElement={path:string;width:number;height:number;x:number;y:number;displayWidth:number;displayHeight:number;rotation:number;locked:boolean};
export type DesignModel={version:1|2;canvas:{width:number;height:number;dpi:number;background:string};elements:DesignElement[];overlay?:OverlayElement};
export function createDesign(width=600,height=1800,dpi=300):DesignModel{return {version:1,canvas:{width,height,dpi,background:"#ffffff"},elements:[]};}
export function validDesign(value:unknown):value is DesignModel {return validateDesign(value);}
