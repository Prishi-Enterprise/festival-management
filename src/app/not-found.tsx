import Link from "next/link";
export default function NotFound() {
  return (
    <main className="standalone">
      <p className="eyebrow">PAGE NOT FOUND</p>
      <h1>This page isn’t here.</h1>
      <Link className="button" href="/admin">
        Back to workspace
      </Link>
    </main>
  );
}
