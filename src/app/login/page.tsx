import { ShieldCheck } from "lucide-react";
import { AuthFrame } from "@/components/auth-frame";
import { EmailLoginForm } from "@/components/email-login-form";
import { isConfigured } from "@/lib/config";
export default function Login() {
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
          Sign in with a code sent to the email your admin has invited.
        </p>
        <EmailLoginForm configured={isConfigured()} />
        <div className="login-divider">or</div>
        <button
          className="google-button"
          disabled
          aria-label="Continue with Google — coming soon"
        >
          <span>Continue with Google</span>
          <span className="badge">Coming soon</span>
        </button>
        <div className="auth-note">
          <ShieldCheck size={18} />
          <p>
            Invitation only. Your email verifies who you are; your admin decides
            what you can access.
          </p>
        </div>
        <p className="tiny muted">
          Need access? Ask your society admin to invite your email address.
        </p>
        <footer className="login-prishi-footer">
          <a href="https://prishi.in">
            A product by Prishi <span aria-hidden="true">↗</span>
          </a>
        </footer>
      </div>
    </AuthFrame>
  );
}
