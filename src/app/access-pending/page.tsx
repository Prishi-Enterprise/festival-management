import { AuthFrame } from "@/components/auth-frame";
export default function AccessPending() {
  return (
    <AuthFrame>
      <div className="auth-card">
        <span className="badge">Invitation required</span>
        <h2>
          Your account
          <br />
          isn’t onboarded.
        </h2>
        <p className="muted">
          Ask an admin to invite this exact email, or reactivate your
          membership. If you were just invited, sign out and sign in again to
          claim access.
        </p>
        <form action="/auth/signout" method="post">
          <button className="button">Use another email account</button>
        </form>
      </div>
    </AuthFrame>
  );
}
