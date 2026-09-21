import { Brand } from "./brand";
export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div>
          <p className="eyebrow">MADE FOR OUR COMMUNITY</p>
          <h1>
            Less paperwork.
            <br />
            More celebration.
          </h1>
          <p>
            One place to prepare the festival,
            <br />
            bring the committee together,
            <br />
            and keep every detail in order.
          </p>
          <div className="petals" aria-hidden="true">
            ✳
          </div>
        </div>
        <footer>
          Radhe Society <span>•</span> Together, every year.
        </footer>
      </section>
      <section className="auth-content">{children}</section>
    </main>
  );
}
