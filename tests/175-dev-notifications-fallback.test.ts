import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ConsoleDevNotificationAdapter,
  RealNotificationAdapter,
} from "@/adapters/notifications";
import { selectNotificationAdapter } from "@/lib/dev-bypass";

/**
 * Persona create fix — dev notifications fallback.
 *
 * Root cause: `context.ts` wired `RealNotificationAdapter` unconditionally.
 * Locally (no INNGEST_EVENT_KEY) the persona-training workflow runs INLINE via
 * `LocalDevWorkflowAdapter`, and with DEV_FAL_FALLBACK the training completes
 * synchronously → `sendEmail` → `requireEnv("RESEND_API_KEY")` throws inside
 * the request → `POST /api/personas` 400. No Adult/Baby Persona could ever be
 * created locally.
 *
 * The fix mirrors the ADR-0010 moderation precedent: key-presence gated —
 * RESEND_API_KEY present OR production → RealNotificationAdapter (production
 * still fails loud on a missing key); otherwise a console dev adapter that
 * never throws. Inert in production.
 */

describe("175 — dev notifications fallback (key-presence gated, inert in production)", () => {
  const prev = {
    NODE_ENV: process.env.NODE_ENV,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
  };

  beforeEach(() => {
    (process.env as Record<string, string>).NODE_ENV = "test";
    delete process.env.RESEND_API_KEY;
  });

  afterEach(() => {
    (process.env as Record<string, string>).NODE_ENV = prev.NODE_ENV ?? "test";
    if (prev.RESEND_API_KEY !== undefined) process.env.RESEND_API_KEY = prev.RESEND_API_KEY;
    else delete process.env.RESEND_API_KEY;
  });

  it("selects the console dev adapter when RESEND_API_KEY is absent outside production", () => {
    expect(selectNotificationAdapter()).toBeInstanceOf(ConsoleDevNotificationAdapter);
  });

  it("selects the real adapter when RESEND_API_KEY is set", () => {
    process.env.RESEND_API_KEY = "re_key_is_set";
    expect(selectNotificationAdapter()).toBeInstanceOf(RealNotificationAdapter);
  });

  it("selects the real adapter in production even without a key (fail loud, never silent)", () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    expect(selectNotificationAdapter()).toBeInstanceOf(RealNotificationAdapter);
  });

  it("console dev adapter never throws (email + push resolve)", async () => {
    const adapter = new ConsoleDevNotificationAdapter();
    await expect(
      adapter.sendEmail("dev@example.com", "Your persona is ready", "~5 minutes")
    ).resolves.toBeUndefined();
    await expect(
      adapter.sendWebPush("member-1", "Persona ready", "Training complete")
    ).resolves.toBeUndefined();
  });
});
