"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  Copy,
  ShieldCheck,
  Check,
  Mail,
  Settings2,
} from "lucide-react";
import { inviteMember, revokeInvite, updateMember } from "@/app/admin/actions";
import type { Festival, Invitation, Member } from "@/lib/types";
type Assignment = { user_id: string; festival_id: string };
function MemberEditor({
  member,
  festivals,
  assigned,
}: {
  member: Member;
  festivals: Festival[];
  assigned: string[];
}) {
  const [role, setRole] = useState(member.role);
  const [active, setActive] = useState(member.active);
  const [ids, setIds] = useState(assigned);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <details className="member-editor">
      <summary>
        <Settings2 size={16} />
        Manage
      </summary>
      <div className="member-editor-body">
        <h3>Manage {member.display_name || member.email}</h3>
        <div className="form-grid">
          <label>
            Role
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Member["role"])}
            >
              <option value="committee">Committee member</option>
              <option value="admin">Administrator</option>
            </select>
          </label>
          <label>
            Access
            <select
              value={active ? "active" : "inactive"}
              onChange={(e) => setActive(e.target.value === "active")}
            >
              <option value="active">Active</option>
              <option value="inactive">Deactivated</option>
            </select>
          </label>
        </div>
        <fieldset>
          <legend>Festival assignments</legend>
          {festivals.map((f) => (
            <label className="checkbox-row" key={f.id}>
              <input
                type="checkbox"
                checked={ids.includes(f.id)}
                onChange={() =>
                  setIds(
                    ids.includes(f.id)
                      ? ids.filter((id) => id !== f.id)
                      : [...ids, f.id],
                  )
                }
              />
              {f.name}
            </label>
          ))}
          {!festivals.length && (
            <p className="muted small">
              Create a festival to assign committee access.
            </p>
          )}
        </fieldset>
        <p className="tiny muted">
          Administrators have access to all festivals and detailed reports. At
          least one active admin must remain.
        </p>
        {message && (
          <p className="notice error" role="alert">
            {message}
          </p>
        )}
        <button
          className="button small-button"
          disabled={pending}
          onClick={() => {
            setMessage("");
            start(async () => {
              const result = await updateMember({
                user_id: member.user_id,
                role,
                active,
                version: member.version,
                festival_ids: ids,
              });
              if (!result.ok) setMessage(result.error);
              else router.refresh();
            });
          }}
        >
          {pending ? "Saving…" : "Save access"}
        </button>
      </div>
    </details>
  );
}
export function UserManager({
  members,
  invitations,
  festivals,
  assignments,
  loginUrl,
  now,
}: {
  members: Member[];
  invitations: Invitation[];
  festivals: Festival[];
  assignments: Assignment[];
  loginUrl: string;
  now: number;
}) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <div className="people-grid">
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Invite to the committee</h2>
              <p className="small muted">
                Onboard their exact Google email before they sign in.
              </p>
            </div>
            <UserPlus size={23} />
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              setError("");
              setNotice("");
              start(async () => {
                const result = await inviteMember({
                  email: data.get("email"),
                  role: data.get("role"),
                  festival_ids: data.getAll("festivals"),
                });
                if (!result.ok) setError(result.error);
                else {
                  form.reset();
                  setNotice(
                    "Account invited. Share the sign-in link with them; no email was sent.",
                  );
                  router.refresh();
                }
              });
            }}
          >
            <div className="form-grid">
              <label>
                Google email
                <input
                  type="email"
                  name="email"
                  placeholder="name@gmail.com"
                  required
                  maxLength={254}
                />
              </label>
              <label>
                Role
                <select name="role" defaultValue="committee">
                  <option value="committee">Committee member</option>
                  <option value="admin">Administrator</option>
                </select>
              </label>
            </div>
            <fieldset>
              <legend>Assign festivals</legend>
              {festivals.length ? (
                festivals.map((f) => (
                  <label className="checkbox-row" key={f.id}>
                    <input type="checkbox" name="festivals" value={f.id} />
                    {f.name}
                  </label>
                ))
              ) : (
                <p className="muted small">
                  You can assign festivals after creating one.
                </p>
              )}
            </fieldset>
            <p className="tiny muted">
              Admin access includes all festivals, user management and detailed
              reports.
            </p>
            <button className="button" disabled={pending}>
              <UserPlus size={17} />
              {pending ? "Saving…" : "Create invitation"}
            </button>
          </form>
        </section>
        <aside className="panel invite-guide">
          <span className="tile-icon">
            <ShieldCheck size={24} />
          </span>
          <h2>
            A familiar sign-in.
            <br />
            The right access.
          </h2>
          <p>
            Members use their own Google account. No new passwords to remember.
          </p>
          <div className="guide-divider" />
          <p className="small">
            Committee members can edit their own entries until an admin confirms
            and locks them. Detailed financial reports stay with admins.
          </p>
          <button
            className="button secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(loginUrl);
                setNotice(
                  "Sign-in link copied. Share it only after onboarding the account.",
                );
              } catch {
                setError("Could not copy. Sign-in link: " + loginUrl);
              }
            }}
          >
            <Copy size={16} />
            Copy sign-in link
          </button>
        </aside>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice success" role="status">
          <Check size={16} />
          {notice}
        </p>
      )}
      <section className="panel">
        <div className="section-heading">
          <h2>
            Onboarded members{" "}
            <span className="count-pill">{members.length}</span>
          </h2>
          <span className="small muted">
            Access changes take effect immediately
          </span>
        </div>
        <div className="member-list">
          {members.map((member) => (
            <div
              className="person-row"
              key={`${member.user_id}-${member.version}`}
            >
              <span className="avatar">
                {(member.display_name || member.email)[0].toUpperCase()}
              </span>
              <div className="person-info">
                <strong>{member.display_name || member.email}</strong>
                <small>{member.email}</small>
              </div>
              <span className={`badge ${member.active ? "green" : ""}`}>
                {member.active ? "Active" : "Deactivated"}
              </span>
              <span className="role-text">
                {member.role === "admin" ? "Admin" : "Committee"}
              </span>
              <MemberEditor
                member={member}
                festivals={festivals}
                assigned={assignments
                  .filter((a) => a.user_id === member.user_id)
                  .map((a) => a.festival_id)}
              />
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>
            Invitations <span className="count-pill">{invitations.length}</span>
          </h2>
          <Mail size={20} />
        </div>
        {invitations.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Google account</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((invite) => {
                  const expired =
                    invite.expires_at !== "infinity" &&
                    new Date(invite.expires_at).getTime() <= now;
                  return (
                    <tr key={invite.id}>
                      <td>{invite.email}</td>
                      <td>{invite.role}</td>
                      <td>
                        <span className="badge">
                          {invite.status === "pending" && expired
                            ? "Expired"
                            : invite.status}
                        </span>
                      </td>
                      <td>
                        {invite.expires_at === "infinity"
                          ? "Initial admin"
                          : invite.expires_at.slice(0, 10)}
                      </td>
                      <td>
                        {invite.status === "pending" && (
                          <button
                            disabled={pending}
                            className="text-button danger"
                            onClick={() => {
                              setError("");
                              start(async () => {
                                const result = await revokeInvite(invite.id);
                                if (!result.ok) setError(result.error);
                                else {
                                  setNotice("Invitation revoked.");
                                  router.refresh();
                                }
                              });
                            }}
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state compact">
            <Mail size={27} />
            <p>Invitations will appear here when you onboard an account.</p>
          </div>
        )}
      </section>
    </>
  );
}
