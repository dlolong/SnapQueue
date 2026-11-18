export const MAX_PHOTO_BYTES=20*1024*1024;
export function imageTypeMatches(type,bytes){if(type==="image/jpeg")return bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;if(type==="image/png")return bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47;if(type==="image/webp")return String.fromCharCode(...bytes.slice(8,12))==="WEBP";return false}
export function validatePhoto(type,bytes){return bytes.length>0&&bytes.length<=MAX_PHOTO_BYTES&&["image/jpeg","image/png","image/webp"].includes(type)&&imageTypeMatches(type,bytes)}
