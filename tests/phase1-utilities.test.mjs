import test from "node:test";
import assert from "node:assert/strict";
import { addDpiMetadata,pngDimensions,jpegDimensions,imageDpi } from "../src/lib/design/raster-metadata.mjs";
import { validatePhoto } from "../src/lib/media-validation.mjs";
import { validateDesign } from "../src/lib/design/validation.mjs";
import { photoTargetPixels } from "../src/lib/guest/photo-target.mjs";

// A tiny valid 1×1 PNG fixture.
const onePixelPng=Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lS8AAAAASUVORK5CYII=","base64"));
test("photo optimization targets track layout frame size with zoom headroom",()=>{
 assert.deepEqual(photoTargetPixels({width:1200,height:1800}),{width:1800,height:2700});
 assert.deepEqual(photoTargetPixels({width:240,height:480},1),{width:240,height:480});
 assert.throws(()=>photoTargetPixels({width:0,height:480}),/invalid/i);
});
test("export metadata preserves exact canvas dimensions and adds 300 DPI pHYs",()=>{
 const pixels=onePixelPng.slice();pixels[18]=0x02;pixels[19]=0x58;pixels[22]=0x07;pixels[23]=0x08; // 600 × 1800
 const out=addDpiMetadata(pixels,"image/png",300);assert.deepEqual(pngDimensions(out),{width:600,height:1800});
 const phys=out.findIndex((_,i)=>i>30&&String.fromCharCode(...out.slice(i,i+4))==="pHYs");assert.ok(phys>0);assert.equal(out[phys+4],0);assert.equal(out[phys+5],0);assert.equal(out[phys+6],0x2e);assert.equal(out[phys+7],0x23);assert.equal(out[phys+12],1);assert.equal(imageDpi(out,"image/png"),300);
});
test("supported print sizes preserve exact physical pixel dimensions",()=>{
 for(const [width,height] of [[600,1800],[1200,1800],[1200,1200]]){const png=onePixelPng.slice();png.set([width>>>24,(width>>>16)&255,(width>>>8)&255,width&255],16);png.set([height>>>24,(height>>>16)&255,(height>>>8)&255,height&255],20);const output=addDpiMetadata(png,"image/png",300);assert.deepEqual(pngDimensions(output),{width,height});}
});
test("photo upload validation checks MIME signature and size",()=>{
 assert.equal(validatePhoto("image/jpeg",Uint8Array.from([0xff,0xd8,0xff,0x00])),true);
 assert.equal(validatePhoto("image/png",Uint8Array.from([0xff,0xd8,0xff,0x00])),false);
 assert.equal(validatePhoto("image/gif",Uint8Array.from([0x47,0x49,0x46])),false);
 assert.equal(validatePhoto("image/jpeg",new Uint8Array(20*1024*1024+1)),false);
});
test("JPEG DPI parser rejects non-JPEG and reads SOF dimensions",()=>{
 const jpeg=Uint8Array.from([255,216,255,192,0,11,8,7,8,2,88,3,32,1,1,17,0,255,217]);
 assert.deepEqual(jpegDimensions(jpeg),{width:600,height:1800});
 const tagged=addDpiMetadata(jpeg,"image/jpeg",300);assert.equal(imageDpi(tagged,"image/jpeg"),300);
 assert.throws(()=>jpegDimensions(onePixelPng));
});
test("versioned design JSON round trips as valid persisted data",()=>{
 const design={version:1,canvas:{width:600,height:1800,dpi:300,background:"#ffffff"},elements:[{id:"slot-1",type:"photo",x:10,y:20,width:580,height:500,rotation:0,zIndex:1,visible:true,locked:false,fit:"cover"}]};
 assert.equal(validateDesign(JSON.parse(JSON.stringify(design))),true);
 assert.equal(validateDesign({...design,version:2}),true);
 assert.equal(validateDesign({...design,version:3}),false);
 const overlay={path:"workspace/templates/overlay.png",width:1200,height:1800,x:0,y:0,displayWidth:600,displayHeight:900,rotation:0,locked:true};
 assert.equal(validateDesign({...design,version:2,overlay}),true);
 assert.equal(validateDesign({...design,version:2,overlay:{...overlay,displayWidth:0}}),false);
});
