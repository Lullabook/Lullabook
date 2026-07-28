export function makeTestSafetensorsArtifact(metadata: Record<string, unknown> = {}): Buffer {
  const header = Buffer.from(JSON.stringify({ __metadata__: metadata }), "utf8");
  const prefix = Buffer.alloc(8);
  prefix.writeBigUInt64LE(BigInt(header.length));
  return Buffer.concat([prefix, header, Buffer.from([0])]);
}
