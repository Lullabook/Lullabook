import { SubmitButton } from "@/components/submit-button";
import { updateBabyBirthDateAction } from "@/lib/actions";

interface BabyBirthdateFormProps {
  babyId: string;
  babyName: string;
  birthDate: string | null;
  canEdit: boolean;
}

export function BabyBirthdateForm({
  babyId,
  babyName,
  birthDate,
  canEdit,
}: BabyBirthdateFormProps) {
  if (!canEdit) {
    return (
      <p style={{ margin: 0, color: "#6E6076", fontSize: "0.92rem" }}>
        {birthDate
          ? `${babyName}'s birthday is ${new Date(birthDate + "T12:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.`
          : `No birthday saved for ${babyName} yet.`}
      </p>
    );
  }

  return (
    <form action={updateBabyBirthDateAction} className="v2-stack" style={{ gap: 12 }}>
      <input type="hidden" name="babyId" value={babyId} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label
          htmlFor="birthDate"
          style={{
            fontFamily: "var(--v2-font-display)",
            fontWeight: 700,
            color: "#2E2438",
            fontSize: "0.95rem",
          }}
        >
          {babyName}&apos;s birthday
        </label>
        <input
          id="birthDate"
          name="birthDate"
          type="date"
          defaultValue={birthDate ?? ""}
          style={{
            width: "100%",
            maxWidth: 280,
            fontFamily: "var(--v2-font-body)",
            fontSize: "1rem",
            color: "#2E2438",
            background: "#FBF4E7",
            border: "1px solid #ECE1CE",
            borderRadius: 14,
            padding: "13px 15px",
            boxSizing: "border-box",
          }}
        />
        <span style={{ fontSize: "0.82rem", color: "#9A8A78" }}>
          Used for birthday story offers — optional, and private to your family.
        </span>
      </div>
      <SubmitButton
        className="v2-btn v2-btn--primary"
        label="Save birthday"
        pendingLabel="Saving…"
      />
    </form>
  );
}
