import type { JurisdictionConfig, MemberRole } from "@/domain/types";
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
