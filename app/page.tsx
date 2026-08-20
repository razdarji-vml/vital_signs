import Image from "next/image";
import { connection } from "next/server";
import BlinkTracker from "@/components/BlinkTracker";
import VoiceArousalMonitor from "@/components/VoiceArousalMonitor";

export default async function Home() {
  await connection();

  return (
    <main>
      <section className="hero" aria-labelledby="page-title"><div className="page-shell">
        <header className="site-header"><Image src="/ford-logo.svg" alt="Ford" width={150} height={60} priority className="ford-logo" /><span className="header-label">Research prototype / 01</span></header>
        <div className="hero-copy"><p className="eyebrow"><span /> Driver wellbeing, in real time</p><h1 id="page-title">Driver<br />Signals</h1>
          <div className="hero-intro"><p>A private, browser-based view of changes in eye activity and vocal energy that may accompany stress behind the wheel.</p><p className="privacy-note">No recordings. No uploads.<br />Processing stays on this device.</p></div>
        </div>
      </div></section>
      <section className="monitor-section" aria-label="Live signal monitors"><div className="page-shell">
        <div className="section-heading"><div><p className="section-index">01 / DRIVER STATE</p><h2>Read the<br />road within.</h2></div><p>Start either sensor before driving to explore how your signals respond. Never interact with this interface while the vehicle is moving.</p></div>
        <div className="instrument-panel"><div className="monitor-grid"><BlinkTracker /><VoiceArousalMonitor /></div>
          <aside className="disclaimer"><span className="disclaimer-mark" aria-hidden="true">!</span><p><strong>For awareness only — not a safety or diagnostic system.</strong> These signals cannot determine whether you are stressed, fatigued or fit to drive. If you feel impaired or overwhelmed, pull over somewhere safe and take a break.</p></aside>
        </div>
      </div></section>
      <footer><div className="page-shell footer-inner"><span>Driver Signals</span><span>Driver wellbeing prototype · 2026</span></div></footer>
    </main>
  );
}
