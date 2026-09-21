import { Brand } from "@/components/brand";
import Link from "next/link";
import "./welcome.css";
export default function Home() {
  return (
    <div className="landing page">
      <header className="masthead">
        <Link className="wordmark" href="/" aria-label="Festivals home">
          FESTIVALS <span>BY PRISHI</span>
        </Link>
        <span className="location">OUR SOCIETY. OUR CELEBRATIONS.</span>
      </header>
      <main>
        <section className="welcome" aria-labelledby="welcome-title">
          <div className="logo-frame">
            <Brand />
          </div>
          <div className="eyebrow">
            <span></span> WELCOME TO YOUR FESTIVAL DESK <span></span>
          </div>
          <h1 id="welcome-title">
            Together is where
            <br />
            the <em>celebration begins.</em>
          </h1>
          <p className="intro">
            Our traditions. Our people. Our shared moments.
            <br />A shared home for our community’s celebrations.
          </p>
          <Link className="status" href="/societies">
            Open festival desk <span aria-hidden="true">→</span>
          </Link>
        </section>
        <div className="community-note">
          <span className="ornament" aria-hidden="true">
            ✦
          </span>
          <p>
            Built for our community.
            <br />
            <strong>Made for every celebration.</strong>
          </p>
          <span className="ornament" aria-hidden="true">
            ✦
          </span>
        </div>
      </main>
      <footer>
        <span>FESTIVALS BY PRISHI</span>
        <span lang="gu">સાથે મળીને, દરેક ઉજવણી.</span>
        <span>festivals.prishi.in</span>
      </footer>
    </div>
  );
}
