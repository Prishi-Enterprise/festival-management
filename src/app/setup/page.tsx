import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
export default function Setup() {
  return (
    <AuthFrame>
      <div className="auth-card">
        <p className="eyebrow">DEVELOPMENT SETUP</p>
        <h2>
          Connect the
          <br />
          festival desk.
        </h2>
        <p className="muted">
          Use the Supabase dev environment to get started.
        </p>
        <ol className="steps">
          <li>
            <strong>Connect dev</strong>
            <p>
              Copy <code>.env.example</code> to <code>.env.local</code>. Add the
              dev URL and publishable key.
            </p>
          </li>
          <li>
            <strong>Apply the admin migration</strong>
            <p>
              Follow <code>docs/DEVELOPMENT.md</code> to create the tables,
              permissions and initial admin invitation.
            </p>
          </li>
          <li>
            <strong>Enable Google sign-in</strong>
            <p>
              Configure the Google provider, localhost callback and invitation
              hook. Restart the app.
            </p>
          </li>
        </ol>
        <Link className="button" href="/login">
          Back to sign-in
        </Link>
        <p className="tiny muted">
          No service-role key is needed by this application.
        </p>
      </div>
    </AuthFrame>
  );
}
