# Finance permission and QR attendance

## Finance & accounts

Society admins can grant this permission when inviting or editing a committee member. It automatically includes general report access. Members can see and confirm pending financial entries in their assigned festivals, including entries created by someone else. Confirmation records the actual reviewer in the audit log and preserves balance checks and optimistic locking.

This is not an administrator role. Unlocking, changing another author's receipt, managing members, editing festival setup and detailed report exports remain under their existing permissions. Revocation and inactive membership are checked in the database, not just in the UI. Removing Finance does not silently remove a separately retained report permission; admins can clear Reports independently.

Migration: 202609220003_finance_permission.sql.

## QR attendance

Guest-pass pages include printable QR codes. Each household enrollment gets a separate unguessable resident attendance pass; find it under Attendance & guests → Flat contacts & daily RSVP → Open resident QR pass. The resident pass does not include contact phone numbers, names or the RSVP editing token. A resident pass reflects current confirmed payment eligibility.

Select day and meal, then scan using the authenticated committee attendance page. Camera scanning uses a bundled QR decoder, with paste-link lookup as a fallback. The scanner never navigates to arbitrary QR destinations or automatically marks attendance. It filters to the matching resident/guest row; the operator saves the total admitted using existing check-in controls. Codes for other environments, festivals or unrelated meals cannot select a matching record. Existing database limits, cancellation checks, repeat-scan limits, optimistic versions and admin-only reductions still apply.

One resident QR per flat and one guest QR per booking. The same QR can be used for its applicable meals; each meal has a separate allowance. No offline check-in: network access is required to persist authoritative counts. A physical phone/tablet camera and real printed/screen pass should be exercised before production release.

Migration: 202609220004_resident_qr_pass.sql.
