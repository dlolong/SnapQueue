import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { templateApiContext } from "@/lib/templates/api-auth";
import { imageDimensions } from "@/lib/design/raster-metadata.mjs";
import { imageTypeMatches } from "@/lib/media-validation.mjs";

const MAX_BYTES=20*1024*1024;
export async function POST(request:Request){
 const context=await templateApiContext();if("error" in context)return NextResponse.json({error:context.error},{status:context.status});
 let form:FormData;try{form=await request.formData()}catch{return NextResponse.json({error:"Invalid upload request"},{status:400})}
 const file=form.get("file");if(!(file instanceof File))return NextResponse.json({error:"Choose a PNG overlay"},{status:400});
 if(file.type!=="image/png"||file.size<1||file.size>MAX_BYTES)return NextResponse.json({error:"Overlay must be a PNG no larger than 20 MB"},{status:400});
 const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.length<8||bytes[0]!==137||String.fromCharCode(...bytes.subarray(1,4))!=="PNG"||bytes[4]!==13||bytes[5]!==10||bytes[6]!==26||bytes[7]!==10||!imageTypeMatches(file.type,bytes))return NextResponse.json({error:"The file is not a valid PNG"},{status:400});
 let dimensions:{width:number;height:number};try{dimensions=imageDimensions(bytes,file.type)}catch{return NextResponse.json({error:"Could not read PNG dimensions"},{status:400})}
 if(dimensions.width<1||dimensions.height<1||dimensions.width>5000||dimensions.height>5000||dimensions.width*dimensions.height>25000000)return NextResponse.json({error:"Overlay dimensions must be at most 5000 × 5000 and 25 megapixels"},{status:400});
 const path=`${context.workspaceId}/templates/${crypto.randomUUID()}.png`;const admin=createAdminClient();
 const {error}=await admin.storage.from("snapqueue-template-overlays").upload(path,bytes,{contentType:"image/png",upsert:false});
 if(error)return NextResponse.json({error:error.message},{status:400});
 return NextResponse.json({path,width:dimensions.width,height:dimensions.height});
}
