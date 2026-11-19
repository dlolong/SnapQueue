import Link from "next/link";
import { signUp } from "@/lib/auth/actions";
import { BrandLogo } from "@/components/brand-logo";
export default async function SignupPage({ searchParams }: { searchParams: Promise<{error?:string}> }) {
 const params=await searchParams;
 return <main className="auth-page"><form action={signUp} className="auth-card"><BrandLogo className="auth-brand-logo"/><h1>Create your account</h1><p>Start organizing your photobooth work.</p>{params.error&&<p className="form-error">{params.error}</p>}<label>Email<input name="email" type="email" autoComplete="email" required/></label><label>Password<input name="password" type="password" minLength={8} autoComplete="new-password" required/></label><button className="button">Create account</button><small>Already registered? <Link href="/login">Sign in</Link></small></form></main>
}
