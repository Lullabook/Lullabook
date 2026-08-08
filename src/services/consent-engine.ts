import { v4 as uuid } from "uuid";
import type { DataStore } from "@/db/store";
import { RlsViolationError } from "@/db/store";
import type { ConsentReceipt, JurisdictionConfig, MemberRole } from "@/domain/types";
import { isR1UsOnly, R1_US_MARKETS, isMarketEnabled } from "@/lib/r1-config";

export type ConsentAction =
  | "create_baby_persona"
  | "create_adult_persona"
  | "create_character"
  | "signup";

export interface ConsentCheckInput {
  jurisdiction: string;
  actorRole: MemberRole;
  action: ConsentAction;
  hasActiveSubscription: boolean;
  hasConsentReceipt: boolean;
  hasAttestation?: boolean;
}

export interface ConsentCheckResult {
  allowed: boolean;
  requiredMethod?: string;
  /** Machine-readable gate code (172 red-team) — stable across copy edits. */
  code?: "consent_required";
  reason?: string;
}

const JURISDICTIONS: Record<string, JurisdictionConfig> = {
  US: {
    code: "US",
    childAgeThreshold: 13,
    consentMethod: "payment_vpc",
    characterConsentMethod: "light_attestation",
    noticeVersion: "us-coppa-v1",
    residencyRegion: "us-east-1",
    enabled: true,
    requiresLiveness: true,
  },
  US_IOS: {
    code: "US_IOS",
    childAgeThreshold: 13,
    consentMethod: "email_plus",
    characterConsentMethod: "light_attestation",
    noticeVersion: "us-coppa-v1",
    residencyRegion: "us-east-1",
    enabled: true,
    requiresLiveness: true,
  },
  IN: {
    code: "IN",
    childAgeThreshold: 18,
    consentMethod: "payment_vpc",
    characterConsentMethod: "light_attestation",
    noticeVersion: "in-dpdp-v1",
    residencyRegion: "ap-south-1",
    enabled: true,
    requiresLiveness: true,
  },
  KR: {
    code: "KR",
    childAgeThreshold: 14,
    consentMethod: "signed_form",
    characterConsentMethod: "light_attestation",
    noticeVersion: "kr-pipa-v1",
    residencyRegion: "ap-northeast-2",
    enabled: false,
    requiresLiveness: true,
  },
  SG: {
    code: "SG",
    childAgeThreshold: 13,
    consentMethod: "payment_vpc",
    characterConsentMethod: "light_attestation",
    noticeVersion: "sg-pdpa-v1",
    residencyRegion: "ap-southeast-1",
    enabled: false,
    requiresLiveness: true,
  },
  JP: {
    code: "JP",
    childAgeThreshold: 13,
    consentMethod: "payment_vpc",
    characterConsentMethod: "light_attestation",
    noticeVersion: "jp-appi-v1",
    residencyRegion: "ap-northeast-1",
    enabled: false,
    requiresLiveness: true,
  },
  STRICT: {
    code: "STRICT",
    childAgeThreshold: 13,
    consentMethod: "payment_vpc",
    characterConsentMethod: "payment_vpc",
    noticeVersion: "strict-v1",
    residencyRegion: "us-east-1",
    enabled: true,
    requiresLiveness: true,
  },
};

export class ConsentEngine {
  static getJurisdiction(code: string): JurisdictionConfig | undefined {
    return JURISDICTIONS[code];
  }

  static listJurisdictions(): JurisdictionConfig[] {
    return Object.values(JURISDICTIONS);
  }

  /**
   * Issue 147 — the markets enabled *for this release*. When R1_US_ONLY is set,
   * only the US markets (US / US_IOS) are enabled; the Asia slots (IN/KR/SG/JP)
   * stay in the config table (flag-disabled) so R1.1 enables them by data
   * change, not a rebuild. ADR-0015: config-driven, never hardcoded.
   */
  static listEnabledJurisdictions(): JurisdictionConfig[] {
    return Object.values(JURISDICTIONS).filter((j) => isMarketEnabled(j.code, j.enabled));
  }

  /**
   * Issue 147 — a non-US request rides the same config path: clean "not
   * available in your region", never a crash. Falls back to the US default
   * config so a caller never gets an undefined market (the residency/notice
   * still resolve). The *enabled* decision is the gate.
   */
  static resolveMarketOrDefault(code: string): { config: JurisdictionConfig; enabled: boolean } {
    const config = JURISDICTIONS[code] ?? JURISDICTIONS.US;
    return { config, enabled: isMarketEnabled(config.code) };
  }

  check(input: ConsentCheckInput): ConsentCheckResult {
    const config = JURISDICTIONS[input.jurisdiction];
    if (!config) {
      // Issue 147 — unknown jurisdiction never crashes; resolves to the US
      // default config but is gated as not-enabled under US-only.
      const resolved = ConsentEngine.resolveMarketOrDefault(input.jurisdiction);
      return {
        allowed: false,
        reason: resolved.enabled ? "Unknown jurisdiction" : "Market not available in your region",
      };
    }
    if (!isMarketEnabled(config.code, config.enabled) && input.action === "signup") {
      return { allowed: false, reason: "Market not available in your region" };
    }

    if (input.action === "create_baby_persona") {
      if (input.actorRole !== "guardian") {
        return { allowed: false, reason: "Only guardians may create baby personas" };
      }
      if (!input.hasActiveSubscription) {
        return {
          allowed: false,
          requiredMethod: config.consentMethod,
          reason: "Active subscription required",
        };
      }
      if (!input.hasConsentReceipt) {
        return {
          allowed: false,
          requiredMethod: config.consentMethod,
          // Machine-readable gate code (172 red-team): callers must key off
          // this, never the human copy.
          code: "consent_required",
          reason: "Consent receipt required",
        };
      }
      return { allowed: true, requiredMethod: config.consentMethod };
    }

    if (input.action === "create_adult_persona") {
      return { allowed: true };
    }

    if (input.action === "create_character") {
      if (input.actorRole !== "guardian") {
        return { allowed: false, reason: "Only guardians may create characters for real children" };
      }
      if (config.characterConsentMethod === "light_attestation") {
        if (!input.hasAttestation) {
          return {
            allowed: false,
            requiredMethod: "light_attestation",
            reason: "Guardian attestation required",
          };
        }
        return { allowed: true, requiredMethod: "light_attestation" };
      }
      if (!input.hasActiveSubscription) {
        return {
          allowed: false,
          requiredMethod: config.characterConsentMethod,
          reason: "Active subscription required",
        };
      }
      if (!input.hasConsentReceipt) {
        return {
          allowed: false,
          requiredMethod: config.characterConsentMethod,
          reason: "Consent receipt required",
        };
      }
      return { allowed: true, requiredMethod: config.characterConsentMethod };
    }

    return { allowed: isMarketEnabled(config.code, config.enabled) };
  }

  childAgeThreshold(jurisdiction: string): number {
    const config = JURISDICTIONS[jurisdiction];
    if (!config) throw new Error(`Unknown jurisdiction: ${jurisdiction}`);
    return config.childAgeThreshold;
  }

  residencyRegion(jurisdiction: string): string {
    const config = JURISDICTIONS[jurisdiction];
    if (!config) throw new Error(`Unknown jurisdiction: ${jurisdiction}`);
    return config.residencyRegion;
  }
}

/**
 * Roster-scoped consent rules (ticket 207). Built on the jurisdiction-driven
 * child-age threshold and the stored receipt graph:
 *
 *  - SEC-8: whether a person is a minor is read from the jurisdiction's
 *    configured child-age threshold — never a hardcoded age. Routing a 14yo to
 *    verified parental consent at threshold 18 and to self-consent at 13 is a
 *    config change, not a code change.
 *  - SEC-2: a minor's creation requires that specific minor's OWN verified
 *    consent receipt; one minor's receipt never satisfies another (receipts
 *    are bound per subject).
 *  - SEC-9: a minor's consent receipt records the consenting adult's identity
 *    (memberId), and that adult must be the account-holding parent (Guardian).
 *  - SEC-3: an Adult Persona requires the subject's self-consent; a Guardian
 *    attestation is never accepted in its place.
 */
export class RosterConsentEngine {
  /** subjectId (minor persona/person) -> that minor's own verified receipt. */
  private readonly subjectReceipts = new Map<string, ConsentReceipt>();

  constructor(private readonly store: DataStore) {}

  childAgeThreshold(jurisdiction: string): number {
    return ConsentEngine.getJurisdiction(jurisdiction)?.childAgeThreshold ?? 18;
  }

  /** SEC-8: a person below the configured threshold is a minor; config governs. */
  isChild(age: number, jurisdiction: string): boolean {
    return age < this.childAgeThreshold(jurisdiction);
  }

  /**
   * Register verified parental consent FOR ONE SPECIFIC minor subject. The
   * consenting adult must be the account-holding parent (Guardian) of the
   * Family — no other adult may give a minor's consent (SEC-9). Returns the
   * durable receipt, which records the consenting adult's identity in
   * `memberId`.
   */
  registerParentalConsent(input: {
    subjectId: string;
    memberId: string;
    familyId: string;
    jurisdiction: string;
    method?: string;
  }): ConsentReceipt {
    const config = ConsentEngine.getJurisdiction(input.jurisdiction);
    if (!config) throw new Error(`Unknown jurisdiction: ${input.jurisdiction}`);
    const member = this.store.members.get(input.memberId);
    if (!member || member.familyId !== input.familyId) {
      throw new RlsViolationError("Consenting adult is not a member of this Family");
    }
    if (member.role !== "guardian") {
      throw new Error("Only the account-holding parent (Guardian) may give verified parental consent");
    }
    const receipt: ConsentReceipt = {
      id: uuid(),
      familyId: input.familyId,
      memberId: input.memberId,
      jurisdiction: input.jurisdiction,
      noticeVersion: config.noticeVersion,
      method: input.method ?? config.consentMethod,
      status: "verified",
      consentedAt: new Date(),
    };
    this.store.saveConsentReceipt(receipt);
    this.subjectReceipts.set(input.subjectId, receipt);
    return receipt;
  }

  /**
   * SEC-2: require THIS minor's own verified receipt. Receipts are keyed per
   * subject, so one minor's receipt can never satisfy another — a caller that
   * does not hold the specific subject's receipt is rejected.
   */
  requireMinorConsent(input: { subjectId: string; familyId: string }): ConsentReceipt {
    const receipt = this.subjectReceipts.get(input.subjectId);
    if (!receipt) {
      throw new Error(`Verified parental consent is required for this child before their Persona is created`);
    }
    if (receipt.familyId !== input.familyId) {
      throw new RlsViolationError("Consent receipt belongs to another Family");
    }
    if ((receipt.status ?? "verified") !== "verified") {
      throw new Error("Verified parental consent is not in a verified state");
    }
    return receipt;
  }

  /**
   * SEC-3: an Adult Persona requires the subject's own explicit self-consent.
   * A Guardian attestation is deliberately never accepted as a substitute.
   */
  requireAdultSelfConsent(input: {
    selfConsent: boolean;
    guardianAttestation?: boolean;
  }): void {
    if (input.guardianAttestation === true) {
      throw new Error("A Guardian attestation is never accepted in place of the Adult's own self-consent");
    }
    if (input.selfConsent !== true) {
      throw new Error("An Adult Persona requires the subject's own self-consent");
    }
  }
}
