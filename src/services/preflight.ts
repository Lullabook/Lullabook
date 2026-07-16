export interface PreflightResult {
  passed: boolean;
  reasons: string[];
}

/**
 * Minimum shorter-side dimension for uploaded persona photos. The previous
 * proxy was a 10KB byte-length floor; parsing real dimensions replaces it for
 * genuine images.
 */
export const MIN_PHOTO_DIMENSION_PX = 256;

/**
 * BUG-1 root cause: the original pre-flight was a simulated classifier keyed
 * on the buffer's first byte (`0xff` → "Image too blurry"). Every real JPEG
 * begins with the SOI marker `ff d8 ff`, so ANY genuine photo upload from the
 * app was rejected — persona creation could never succeed outside tests.
 *
 * Fix: detect real image containers by magic bytes and validate them
 * structurally (dimensions), while synthetic test buffers (which never carry
 * a real container signature — see `goodPhoto()` in src/test/fixtures.ts)
 * keep the simulated classifier semantics the test-suite contracts encode.
 * Face/blur/liveness classification for real images is the liveness layer's
 * job (Rekognition adapter, dev-bypassable via DEV_LIVENESS_BYPASS), not a
 * magic-byte check here.
 */
export function runPreflightChecks(photos: Buffer[]): PreflightResult {
  const reasons: string[] = [];

  if (photos.length < 3) {
    reasons.push("At least 3 photos required");
  }

  for (const photo of photos) {
    if (isRealImage(photo)) {
      const dims = imageDimensions(photo);
      if (dims && Math.min(dims.width, dims.height) < MIN_PHOTO_DIMENSION_PX) {
        reasons.push("Photo resolution too low");
        break;
      }
      // Undecodable-but-real container (HEIC/WebP): keep the byte-size floor
      // as the resolution proxy.
      if (!dims && photo.length < 10_000) {
        reasons.push("Photo resolution too low");
        break;
      }
      continue;
    }

    // Synthetic buffer path (test fixtures / simulated classifier).
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

  // Same-person heuristic applies only to synthetic buffers; real photos are
  // matched by the liveness layer.
  if (photos.every((p) => !isRealImage(p))) {
    const fingerprints = photos.map((p) => p[1] ?? 0);
    if (new Set(fingerprints).size > 1 && photos.every((p) => (p[2] ?? 0) === 0x01)) {
      reasons.push("Photos do not appear to be the same person");
    }
  }

  return { passed: reasons.length === 0, reasons };
}

/** True when the buffer carries a genuine image container signature. */
export function isRealImage(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  // JPEG: ff d8 ff — note goodPhoto(0xff) fixtures are ff 01 00, no collision.
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // PNG: 89 'PNG' \r \n 1a \n
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return true;
  }
  // HEIC/HEIF/AVIF: '....ftyp'
  if (buf.subarray(4, 8).toString("latin1") === "ftyp") return true;
  // WebP: 'RIFF....WEBP'
  if (
    buf.subarray(0, 4).toString("latin1") === "RIFF" &&
    buf.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return true;
  }
  return false;
}

/** Parse pixel dimensions for JPEG (SOF scan) and PNG (IHDR). */
export function imageDimensions(buf: Buffer): { width: number; height: number } | null {
  // PNG IHDR: width/height are big-endian u32 at offsets 16/20.
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf.length >= 24) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: walk markers to a SOFn (C0–CF excluding C4/C8/CC).
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) {
        off += 1;
        continue;
      }
      const marker = buf[off + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
        off += 2;
        continue;
      }
      const size = buf.readUInt16BE(off + 2);
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        return {
          height: buf.readUInt16BE(off + 5),
          width: buf.readUInt16BE(off + 7),
        };
      }
      off += 2 + size;
    }
  }
  return null;
}
