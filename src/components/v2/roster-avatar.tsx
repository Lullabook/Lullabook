import { rosterAvatarServePath, shouldShowRosterAvatar } from "@/lib/roster-avatar";
import type { PersonaStatus } from "@/domain/types";

export interface RosterAvatarProps {
  name: string;
  initial: string;
  avBg: string;
  status: PersonaStatus;
  avatarKey?: string | null;
  size?: number;
  className?: string;
  badge?: React.ReactNode;
}

/** Generated roster portrait or gradient placeholder (ADR-0020 — never raw photos). */
export function RosterAvatar({
  name,
  initial,
  avBg,
  status,
  avatarKey,
  size = 50,
  className,
  badge,
}: RosterAvatarProps) {
  const showImage = shouldShowRosterAvatar(status, avatarKey);
  const fontSize = size >= 60 ? "1.3rem" : size >= 40 ? "1rem" : "0.85rem";

  return (
    <span
      className={className}
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        background: showImage ? "#FFFDF9" : avBg,
        color: "#fff",
        fontFamily: "var(--v2-font-display)",
        fontWeight: 700,
        fontSize,
      }}
      aria-hidden={!showImage}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={rosterAvatarServePath(avatarKey)}
          alt={`${name} roster avatar`}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        initial
      )}
      {badge}
    </span>
  );
}
