import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { TemplateDesigner } from "@/components/templates/template-designer";
import { requireWorkspace } from "@/lib/workspace";

export default async function NewTemplatePage(){const {role}=await requireWorkspace();if(!["owner","admin","operator"].includes(role))redirect("/templates");return <><PageHeader eyebrow="DESIGN" title="Create print template" description="Build a reusable print layout and save it to your workspace." action={<Link href="/templates" className="button secondary">Back to templates</Link>}/><TemplateDesigner/></>}
