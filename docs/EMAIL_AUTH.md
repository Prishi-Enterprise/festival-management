# Email sign-in

Email OTP is the active sign-in method. Google OAuth code and verified-Google admission remain supported in the backend, with a disabled **Coming soon** button until the provider is configured.

The initial admin is `prishi.ai.ventures@gmail.com`. The unused initial invitation for `shivamastha@gmail.com` is replaced by migration `202609210002_email_otp.sql`. Other admins must be explicitly invited or promoted; there is currently one admin role, not a separate superadmin role.

## Delivery

Resend sends Supabase Auth emails from `Radhe Festival <login@auth.prishi.in>`. Configure SMTP in Supabase: host `smtp.resend.com`, port `465`, username `resend`, password a Resend API key limited to sending for `auth.prishi.in`. Never put the key in the app, Git, or public environment variables. Domain verification is managed through GoDaddy Domain Connect.

Use `supabase/templates/otp.html` for **both Confirm sign up and Magic link or OTP** templates, subject `Your Radhe Festival sign-in code`. The `{{ .Token }}` variable is required. Enable email confirmation and set eight-digit OTPs with a 600-second expiry. Keep the minimum resend interval at 60 seconds. Resend free daily/monthly limits and Supabase Auth email rate limits both apply.

## Access rules

The enabled Before User Created hook admits only invited or already active members. Successful OTP verification alone does not grant app access: `claim_membership` checks confirmed email, matching identity and the Auth-issued OTP method claim, then consumes the exact pending invitation. Uninvited, expired, revoked and inactive accounts cannot gain membership. Existing database role checks and row-level security remain unchanged.

The code request response does not disclose invitation status. Supabase enforces request/verification rate limits. No app service-role key is used. Codes are never logged or stored by the application.

## Local verification

Run local Supabase with the committed templates and confirmation settings. Emails go to Mailpit at `http://127.0.0.1:54324`, not to the internet. A full local browser test confirmed code request, email receipt, verification, initial admin claim and dashboard access. Database tests cover email verification, OTP proof, invitation requirements, inactive membership and Google compatibility.

## Activation checklist

- Verify `auth.prishi.in` in Resend.
- Owner enters and saves scoped SMTP credential in Supabase.
- Save both OTP templates and the 600-second expiry.
- Deploy main and request a real code using the initial admin email.
- Verify first admin sign-in and code replay rejection.
