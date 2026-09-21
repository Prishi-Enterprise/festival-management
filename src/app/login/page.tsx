import { ArrowUpRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { signIn } from "@/app/actions";
import { isConfigured } from "@/lib/config";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const configured = isConfigured();
  return (
    <AuthFrame>
      <div className="auth-card">
        <span className="badge">
          <ShieldCheck size={14} /> Committee access
        </span>
        <h2>
          Welcome to
          <br />
          the festival desk.
        </h2>
        <p className="muted">
          Sign in with the Google account your admin has invited.
        </p>
        {error && (
          <p className="notice error" role="alert">
            We couldn’t complete sign-in. Use your invited Google account and
            try again.
          </p>
        )}
        <form action={signIn}>
          <button className="google-button" disabled={!configured}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.1h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.3 3-7.4ZM12 22c2.7 0 5-1 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Zm-5.6-8c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14ZM12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.9 5.4L6.4 10c.8-2.3 3-4.1 5.6-4.1Z"
              />
            </svg>
            Continue with Google
            <ArrowUpRight size={18} />
          </button>
        </form>
        {!configured && (
          <p className="notice">
            The dev connection hasn’t been set up yet.{" "}
            <Link href="/setup">View setup steps →</Link>
          </p>
        )}
        <div className="auth-note">
          <ShieldCheck size={18} />
          <p>
            Invitation only. Your Google account verifies who you are; your
            admin decides what you can access.
          </p>
        </div>
        <p className="tiny muted">
          Need access? Ask your society admin to invite your Google email.
        </p>
      </div>
    </AuthFrame>
  );
}
