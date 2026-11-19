import Link from "next/link";
import { signIn } from "@/lib/auth/actions";
import { BrandLogo } from "@/components/brand-logo";
import { PasswordInput } from "@/components/password-input";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{error?:string;message?:string}> }) {
 const params=await searchParams;
 return <main className="auth-page"><form action={signIn} className="auth-card"><BrandLogo className="auth-brand-logo"/><h1>Welcome back</h1><p>Sign in to your SnapQueue workspace.</p>{params.error&&<p className="form-error">{params.error}</p>}{params.message&&<p className="form-success">{params.message}</p>}<label>Email<input name="email" type="email" autoComplete="email" required/></label><PasswordInput id="login-password" label="Password" name="password" autoComplete="current-password"/><button className="button">Sign in</button><small>New to SnapQueue? <Link href="/signup">Create an account</Link></small></form></main>
}
