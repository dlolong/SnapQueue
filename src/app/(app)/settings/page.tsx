import { PageHeader } from "@/components/page-header";
import { FilePicker } from "@/components/file-picker";
import { requireWorkspace } from "@/lib/workspace";
import { removeWorkspaceLogo, updateWorkspace, uploadWorkspaceLogo } from "@/lib/data/actions";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const [params, { supabase, workspace, role }] = await Promise.all([searchParams, requireWorkspace()]);
  const canManageBrand = ["owner", "admin"].includes(role);
  const logoUrl = workspace.logo_path ? supabase.storage.from("workspace-logos").getPublicUrl(workspace.logo_path).data.publicUrl : null;

  return <>
    <PageHeader eyebrow="WORKSPACE" title="Settings" description="Manage your business name and brand logo."/>
    {params.error && <p className="form-error" role="alert">{params.error}</p>}
    {params.success && <p className="form-success" role="status">{params.success}</p>}
    <section className="section-card workspace-settings-card">
      <h2>Business profile</h2>
      <form action={updateWorkspace} className="workspace-name-form">
        <div className="field">
          <label htmlFor="business-name">Business name</label>
          <input id="business-name" name="name" defaultValue={workspace.name} required minLength={2} maxLength={80} disabled={!canManageBrand}/>
          <small className="muted">Guests see this name on event pages and order updates.</small>
        </div>
        {canManageBrand && <button className="button">Save business name</button>}
      </form>
      <div className="workspace-logo-section">
        <div>
          <h3>Business logo</h3>
          <p>Shown as your brand in the workspace and on guest pages. PNG, JPG, or WebP, up to 2 MB.</p>
        </div>
        <div className="workspace-logo-preview">
          {logoUrl ? <img src={logoUrl} alt={`${workspace.name} logo preview`}/> : <strong>{workspace.name}</strong>}
          <div className="workspace-logo-attribution"><span>Powered by</span><img src="/images/snapqueue-logo.png" alt="SnapQueue"/></div>
        </div>
        {canManageBrand ? <div className="workspace-logo-actions">
          <form action={uploadWorkspaceLogo} className="workspace-logo-upload">
            <FilePicker id="business-logo" name="logo" accept="image/png,image/jpeg,image/webp" required/>
            <button className="button">Upload logo</button>
          </form>
          {logoUrl && <form action={removeWorkspaceLogo}><button className="button secondary">Remove logo</button></form>}
        </div> : <p className="muted">Ask a workspace owner or admin to update the business logo.</p>}
      </div>
      <p className="workspace-settings-footnote">Only workspace owners and admins can update the business profile.</p>
    </section>
  </>;
}
