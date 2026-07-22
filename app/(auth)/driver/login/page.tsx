import Link from "next/link";
import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
export default function DriverLoginPage(){return <main className="auth-page"><section className="auth-art"><Brand/><div><h1>Your next handoff starts here.</h1><p>Find the right trip, confirm the route, and switch the device into a private passenger experience.</p><div className="auth-route">Driver access</div></div></section><section className="auth-form-wrap"><div><LoginForm role="driver"/><p><Link className="text-link" href="/admin/login">Administrator sign in</Link></p></div></section></main>}
