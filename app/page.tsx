import Link from "next/link";
import { Brand } from "@/components/brand";

export default function Home() {
  return (
    <main className="welcome-page">
      <div className="horizon" aria-hidden="true" />
      <header className="welcome-header"><Brand /></header>
      <section className="welcome-hero">
        <p className="eyebrow">Driver feedback service</p>
        <h1>Every journey leaves an impression.</h1>
        <p className="lede">Choose the workspace that belongs to you. Passenger feedback opens only after a driver starts a secure handoff.</p>
        <div className="role-grid">
          <Link className="role-card role-card-primary" href="/driver/login">
            <span className="role-index">01</span><strong>Driver workspace</strong><span>Find a trip, enter one manually, or begin a passenger handoff.</span><b>Driver sign in →</b>
          </Link>
          <Link className="role-card" href="/admin/login">
            <span className="role-index">02</span><strong>Operations admin</strong><span>Manage the fleet, trips, questionnaires, and consent versions.</span><b>Admin sign in →</b>
          </Link>
        </div>
        <p className="privacy-note">Passenger mode has no public entry point and never exposes driver or admin navigation.</p>
      </section>
    </main>
  );
}
