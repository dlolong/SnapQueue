import { BrandLogo } from "@/components/brand-logo";

export function GuestBusinessBrand({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  return <div className="guest-business-brand">
    {logoUrl
      ? <img className="guest-business-logo" src={logoUrl} alt={name}/>
      : <span className="guest-business-name">{name}</span>}
    <span className="guest-powered-brand"><small>Powered by</small><BrandLogo className="guest-powered-logo"/></span>
  </div>;
}
