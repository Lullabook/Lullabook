import { ConsentEngine } from "@/services/consent-engine";

export class JurisdictionService {
  private readonly engine = new ConsentEngine();

  isMarketEnabled(jurisdiction: string): boolean {
    const config = ConsentEngine.getJurisdiction(jurisdiction);
    return config?.enabled ?? false;
  }

  childAgeThreshold(jurisdiction: string): number {
    return this.engine.childAgeThreshold(jurisdiction);
  }

  residencyRegion(jurisdiction: string): string {
    return this.engine.residencyRegion(jurisdiction);
  }

  storageKeyForRegion(region: string, familyId: string, path: string): string {
    return `${region}/${familyId}/${path}`;
  }
}
