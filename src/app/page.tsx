import Image from "next/image";
import Link from "next/link";
import "./welcome.css";
export default function Home() {
  return (
    <div className="landing page">
      <header className="masthead">
        <Link className="wordmark" href="/" aria-label="Radhe Infinity home">
          RADHE <span>INFINITY</span>
        </Link>
        <span className="location">OUR SOCIETY. OUR CELEBRATIONS.</span>
      </header>
      <main>
        <section className="welcome" aria-labelledby="welcome-title">
          <div className="logo-frame">
            <Image
              src="/radhe-logo.jpg"
              width={342}
              height={358}
              alt="Radhe Infinity Co-operative Housing Service Society Ltd. — gold R, infinity symbol and peacock feather"
            />
          </div>
          <div className="eyebrow">
            <span></span> WELCOME TO RADHE INFINITY <span></span>
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
          <Link className="status" href="/admin">
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
        <span>RADHE INFINITY</span>
        <span lang="gu">સાથે મળીને, દરેક ઉજવણી.</span>
        <span>radhe.prishi.in</span>
      </footer>
    </div>
  );
}
