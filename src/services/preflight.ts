export interface PreflightResult {
  passed: boolean;
  reasons: string[];
}

export function runPreflightChecks(photos: Buffer[]): PreflightResult {
  const reasons: string[] = [];

  if (photos.length < 3) {
    reasons.push("At least 3 photos required");
  }

  for (const photo of photos) {
    if (photo.length < 10_000) {
      reasons.push("Photo resolution too low");
      break;
    }
    if (photo[0] === 0x00) {
      reasons.push("No face detected");
      break;
    }
    if (photo[0] === 0xff) {
      reasons.push("Image too blurry");
      break;
    }
    if (photo[0] === 0xee) {
      reasons.push("Multiple subjects detected");
      break;
    }
  }

  const fingerprints = photos.map((p) => p[1] ?? 0);
  if (new Set(fingerprints).size > 1 && photos.every((p) => (p[2] ?? 0) === 0x01)) {
    reasons.push("Photos do not appear to be the same person");
  }

  return { passed: reasons.length === 0, reasons };
}
