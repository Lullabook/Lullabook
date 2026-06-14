import { describe, expect, it } from "vitest";
import { groupMomentsByWeek, weekStartMonday } from "@/services/moment-week";
import type { Moment } from "@/domain/types";

function moment(overrides: Partial<Moment> & Pick<Moment, "occurredOn" | "body">): Moment {
  return {
    id: overrides.id ?? "m-1",
    familyId: "fam",
    babyId: "baby",
    createdByMemberId: "mem",
    isSignificant: overrides.isSignificant ?? false,
    momentType: overrides.momentType ?? "cozy",
    createdAt: overrides.createdAt ?? new Date("2026-06-13T10:00:00Z"),
    ...overrides,
  };
}

describe("52 — journal weekly spread grouping", () => {
  it("buckets moments into Mon–Sun days for a week", () => {
    const weekStart = "2026-06-08"; // Monday
    const moments = [
      moment({ id: "a", occurredOn: "2026-06-08", body: "Mon" }),
      moment({ id: "b", occurredOn: "2026-06-10", body: "Wed", isSignificant: true }),
      moment({ id: "c", occurredOn: "2026-06-14", body: "Sun" }),
    ];
    const week = groupMomentsByWeek(moments, weekStart, new Date("2026-06-10T12:00:00Z"));
    expect(week.weekStart).toBe(weekStart);
    expect(week.days).toHaveLength(7);
    expect(week.days[0]!.moments).toHaveLength(1);
    expect(week.days[2]!.moments[0]!.isSignificant).toBe(true);
    expect(week.days[6]!.moments[0]!.body).toBe("Sun");
  });

  it("renders empty days quietly", () => {
    const week = groupMomentsByWeek([], "2026-06-08");
    expect(week.days.every((d) => d.moments.length === 0)).toBe(true);
  });

  it("uses Monday as week start", () => {
    const tuesday = new Date("2026-06-10T12:00:00Z");
    expect(weekStartMonday(tuesday)).toBe("2026-06-08");
  });
});
