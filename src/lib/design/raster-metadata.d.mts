export function pngDimensions(bytes:Uint8Array):{width:number;height:number};
export function jpegDimensions(bytes:Uint8Array):{width:number;height:number};
export function imageDpi(bytes:Uint8Array,format:string):number|null;
export function imageDimensions(bytes:Uint8Array,format:string):{width:number;height:number};
export function addDpiMetadata(bytes:Uint8Array,format:string,dpi?:number):Uint8Array;
