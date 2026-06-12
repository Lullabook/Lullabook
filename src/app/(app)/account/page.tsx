import type { Metadata } from "next";
import { requireAuthedContext } from "@/lib/auth";
import {
  inviteMemberFormAction,
  removeMemberFormAction,
  signOutAction,
} from "@/lib/actions";
import { ConsentEngine } from "@/services/consent-engine";
import { HardDeleteConfirm } from "@/components/hard-delete-confirm";
import { SubmitButton } from "@/components/submit-button";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const { ctx, member } = await requireAuthedContext();
  const members = ctx.store.getMembersByFamily(member.familyId);
  const invites = [...ctx.store.invites.values()].filter(
    (i) => i.familyId === member.familyId
  );
  const jurisdiction = ConsentEngine.getJurisdiction(member.jurisdiction);
  const isGuardian = member.role === "guardian";

  return (
    <>
      <div className="row between">
        <h1 style={{ margin: 0 }}>Account</h1>
        <form action={signOutAction}>
          <SubmitButton className="btn btn-ghost btn-sm" label="Sign out" />
        </form>
      </div>

      <div className="card">
        <h2>Family</h2>
        <table className="plain">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              {isGuardian && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.email}</td>
                <td>{m.role === "guardian" ? "Guardian" : "Member"}</td>
                {isGuardian && (
                  <td>
                    {m.id !== member.id && (
                      <form action={removeMemberFormAction.bind(null, m.id)}>
                        <SubmitButton
                          className="btn btn-danger btn-sm"
                          label="Remove"
                          pendingLabel="Removing…"
                        />
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {isGuardian && (
          <>
            <hr className="divider" />
            <h3>Invite a family member</h3>
            <form action={inviteMemberFormAction} className="row">
              <input
                type="email"
                name="email"
                placeholder="grandma@example.com"
                aria-label="Email to invite"
                required
                style={{ flex: 1, minWidth: 200 }}
              />
              <SubmitButton className="btn btn-secondary" label="Invite" pendingLabel="Inviting…" />
            </form>
            {invites.length > 0 && (
              <p className="subtle" style={{ marginTop: 8 }}>
                Pending invites: {invites.map((i) => i.email).join(", ")}
              </p>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h2>Privacy &amp; your data</h2>
        <p className="muted">
          Your jurisdiction: <strong>{jurisdiction?.code ?? member.jurisdiction}</strong>{" "}
          (notice version {jurisdiction?.noticeVersion ?? "—"}). Consent rules,
          child-age thresholds, and data residency follow your jurisdiction.
        </p>
        <ul className="muted" style={{ lineHeight: 2 }}>
          <li>Photos and likeness models are encrypted and never shared.</li>
          <li>Storybooks are private to your Family unless you mint a share link.</li>
          <li>Canceling starts a 30-day export window before purge.</li>
        </ul>
      </div>

      {isGuardian && (
        <div className="card" style={{ borderColor: "rgba(240,138,138,0.4)" }}>
          <h2>Delete everything</h2>
          <p className="muted">
            The right to be forgotten, for real: photos, trained models,
            storybooks, stories, and account data are erased from our database
            and our file storage. This cannot be undone.
          </p>
          <HardDeleteConfirm />
        </div>
      )}
    </>
  );
}
