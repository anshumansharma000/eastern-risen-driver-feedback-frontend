import Link from "next/link";
import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
export default function AdminLoginPage(){return <main className="auth-page"><section className="auth-art"><Brand/><div><h1>Keep every journey in view.</h1><p>Manage drivers, fleet details, trips, questionnaire versions, and passenger consent from one calm operations workspace.</p><div className="auth-route">Administrator access</div></div></section><section className="auth-form-wrap"><div><LoginForm role="admin"/><p><Link className="text-link" href="/driver/login">Driver sign in</Link></p></div></section></main>}
