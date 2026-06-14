import { describe, expect, it } from "vitest";
import { DailyPushScheduler } from "@/services/journal-nudge";

describe("56 — native daily push scheduler", () => {
  const scheduler = new DailyPushScheduler();

  it("sends at most one push during allowed hours", () => {
    expect(
      scheduler.shouldSendPush({
        hasPushPermission: true,
        hasMomentToday: false,
        localHour: 10,
        alreadySentToday: false,
      })
    ).toBe(true);
  });

  it("suppresses when moment already logged today", () => {
    expect(
      scheduler.shouldSendPush({
        hasPushPermission: true,
        hasMomentToday: true,
        localHour: 10,
        alreadySentToday: false,
      })
    ).toBe(false);
  });

  it("respects quiet hours overnight", () => {
    expect(
      scheduler.shouldSendPush({
        hasPushPermission: true,
        hasMomentToday: false,
        localHour: 22,
        alreadySentToday: false,
      })
    ).toBe(false);
    expect(
      scheduler.shouldSendPush({
        hasPushPermission: true,
        hasMomentToday: false,
        localHour: 6,
        alreadySentToday: false,
      })
    ).toBe(false);
  });

  it("degrades silently without permission", () => {
    expect(
      scheduler.shouldSendPush({
        hasPushPermission: false,
        hasMomentToday: false,
        localHour: 10,
        alreadySentToday: false,
      })
    ).toBe(false);
  });

  it("deep-links to capture for the right baby", () => {
    expect(scheduler.captureDeepLink("baby-123")).toBe("/daily?baby=baby-123&date=today");
  });
});
