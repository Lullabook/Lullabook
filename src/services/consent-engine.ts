import type { JurisdictionConfig, MemberRole } from "@/domain/types";

export type ConsentAction = "create_baby_persona" | "create_adult_persona" | "signup";

export interface ConsentCheckInput {
  jurisdiction: string;
  actorRole: MemberRole;
  action: ConsentAction;
  hasActiveSubscription: boolean;
  hasConsentReceipt: boolean;
}

export interface ConsentCheckResult {
  allowed: boolean;
  requiredMethod?: string;
  reason?: string;
}

const JURISDICTIONS: Record<string, JurisdictionConfig> = {
  US: {
    code: "US",
    childAgeThreshold: 13,
    consentMethod: "payment_vpc",
    noticeVersion: "us-coppa-v1",
    residencyRegion: "us-east-1",
    enabled: true,
  },
  IN: {
    code: "IN",
    childAgeThreshold: 18,
    consentMethod: "payment_vpc",
    noticeVersion: "in-dpdp-v1",
    residencyRegion: "ap-south-1",
    enabled: true,
  },
  KR: {
    code: "KR",
    childAgeThreshold: 14,
    consentMethod: "signed_form",
    noticeVersion: "kr-pipa-v1",
    residencyRegion: "ap-northeast-2",
    enabled: false,
  },
  SG: {
    code: "SG",
    childAgeThreshold: 13,
    consentMethod: "payment_vpc",
    noticeVersion: "sg-pdpa-v1",
    residencyRegion: "ap-southeast-1",
    enabled: false,
  },
  JP: {
    code: "JP",
    childAgeThreshold: 13,
    consentMethod: "payment_vpc",
    noticeVersion: "jp-appi-v1",
    residencyRegion: "ap-northeast-1",
    enabled: false,
  },
};

export class ConsentEngine {
  static getJurisdiction(code: string): JurisdictionConfig | undefined {
    return JURISDICTIONS[code];
  }

  static listJurisdictions(): JurisdictionConfig[] {
    return Object.values(JURISDICTIONS);
  }

  check(input: ConsentCheckInput): ConsentCheckResult {
    const config = JURISDICTIONS[input.jurisdiction];
    if (!config) {
      return { allowed: false, reason: "Unknown jurisdiction" };
    }
    if (!config.enabled && input.action === "signup") {
      return { allowed: false, reason: "Market not enabled" };
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
          reason: "Consent receipt required",
        };
      }
      return { allowed: true, requiredMethod: config.consentMethod };
    }

    if (input.action === "create_adult_persona") {
      return { allowed: true };
    }

    return { allowed: config.enabled };
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
