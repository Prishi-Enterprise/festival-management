"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone">
      <p className="eyebrow">SOMETHING DIDN’T LOAD</p>
      <h1>Let’s try that again.</h1>
      <p className="muted">
        The workspace couldn’t reach its data. Check your connection and dev
        setup, then retry.
      </p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
