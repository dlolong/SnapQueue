import Link from "next/link";
import { notFound,redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { TemplateDesigner } from "@/components/templates/template-designer";
import { requireWorkspace } from "@/lib/workspace";

export default async function EditTemplatePage({params,searchParams}:{params:Promise<{templateId:string}>;searchParams:Promise<{success?:string}>}){const [{templateId},{success},{supabase,workspace,role}]=await Promise.all([params,searchParams,requireWorkspace()]);if(!["owner","admin","operator"].includes(role))redirect("/templates");const {data:template,error}=await supabase.from("templates").select("id,name,description,category,width_px,height_px,dpi,background,layout_config,is_active").eq("id",templateId).eq("workspace_id",workspace.id).eq("is_system",false).maybeSingle();if(error||!template)notFound();return <><PageHeader eyebrow="DESIGN" title={template.name} description={`${template.width_px} × ${template.height_px}px · ${template.dpi} DPI`} action={<Link href="/templates" className="button secondary">Back to templates</Link>}/>{success&&<p className="form-success">{success}</p>}<TemplateDesigner template={template}/></>}
