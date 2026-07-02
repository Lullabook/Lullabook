/**
 * Issue 136 — Haptics adapter + press-feedback helpers for maya-ui.
 *
 * Centralizes touch feedback so every shared pressable (PrimaryButton,
 * GhostButton, Chip, BackPill) inherits polish for free. Two invariants from
 * the issue + PRD v15:
 *
 *  1. **Haptics no-op when unavailable** — older sims, Low Power Mode, a user
 *     who disabled the Taptic Engine, or the SDK being unreachable at runtime
 *     must never throw or break the app (fail-open, the deliberate opposite of
 *     moderation).
 *  2. **Reduce-motion respected** — the press spring degrades to an instant
 *     transition when the OS reduce-motion setting is on.
 *
 * The decision logic (which adapter, whether to spring) is pure + tested in
 * `tests/136-maya-ui-press-feedback.test.ts`. The component wiring is
 * type-checked via `(cd mobile && npx tsc --noEmit)`.
 */
import * as Haptics from "expo-haptics";

export type HapticsImpact = "Light" | "Medium" | "Heavy" | "Rigid" | "Soft";
export type HapticsNotification = "Success" | "Warning" | "Error";

export interface HapticsAdapter {
  readonly kind: "real" | "noop";
  impact(style: HapticsImpact): Promise<void>;
  notify(type: HapticsNotification): Promise<void>;
  selection(): Promise<void>;
}

/**
 * The noop adapter — used when haptics are disabled by flag, or when the native
 * SDK is unreachable at runtime (simulated by `__DEV_HAPTICS_UNAVAILABLE__`).
 * Every method resolves void and never throws: a haptics outage must not break
 * the app (fail-open invariant).
 */
class NoopHapticsAdapter implements HapticsAdapter {
  readonly kind = "noop" as const;
  async impact(): Promise<void> {}
  async notify(): Promise<void> {}
  async selection(): Promise<void> {}
}

const IMPACT_MAP: Record<HapticsImpact, Haptics.ImpactFeedbackStyle> = {
  Light: Haptics.ImpactFeedbackStyle.Light,
  Medium: Haptics.ImpactFeedbackStyle.Medium,
  Heavy: Haptics.ImpactFeedbackStyle.Heavy,
  Rigid: Haptics.ImpactFeedbackStyle.Rigid,
  Soft: Haptics.ImpactFeedbackStyle.Soft,
};

const NOTIFY_MAP: Record<HapticsNotification, Haptics.NotificationFeedbackType> = {
  Success: Haptics.NotificationFeedbackType.Success,
  Warning: Haptics.NotificationFeedbackType.Warning,
  Error: Haptics.NotificationFeedbackType.Error,
};

/**
 * The real adapter — wraps `expo-haptics`. Fire-and-forget: every native call is
 * caught so a transport/permission failure never propagates to the press handler
 * (fail-open). Tests construct it directly via the exported `RealHapticsAdapter`
 * class; production goes through `selectHapticsAdapter()`.
 */
export class RealHapticsAdapter implements HapticsAdapter {
  readonly kind = "real" as const;
  async impact(style: HapticsImpact): Promise<void> {
    try {
      await Haptics.impactAsync(IMPACT_MAP[style]);
    } catch {}
  }
  async notify(type: HapticsNotification): Promise<void> {
    try {
      await Haptics.notificationAsync(NOTIFY_MAP[type]);
    } catch {}
  }
  async selection(): Promise<void> {
    try {
      await Haptics.selectionAsync();
    } catch {}
  }
}

/**
 * Whether the haptics SDK is flagged unavailable at runtime. The mobile runtime
 * sets `__DEV_HAPTICS_UNAVAILABLE__ = true` if `expo-haptics` fails to import
 * (e.g. native module missing on an older Simulator) so the rest of the app
 * keeps working. Exported for test injection only.
 */
export function isHapticsUnavailable(): boolean {
  return (
    process.env.EXPO_PUBLIC_HAPTICS_DISABLED === "true" ||
    (globalThis as { __DEV_HAPTICS_UNAVAILABLE__?: boolean }).__DEV_HAPTICS_UNAVAILABLE__ === true
  );
}

/** Select the haptics adapter — noop when disabled/unavailable, real otherwise. */
export function selectHapticsAdapter(): HapticsAdapter {
  return isHapticsUnavailable() ? new NoopHapticsAdapter() : new RealHapticsAdapter();
}

/** Shared singleton so every pressable reuses one adapter instance. */
let _adapter: HapticsAdapter | null = null;
export function getHaptics(): HapticsAdapter {
  if (!_adapter) _adapter = selectHapticsAdapter();
  return _adapter;
}

export type SpringSpec = { type: "spring"; damping: number; stiffness: number };
export type TimingSpec = { type: "timing"; duration: number };
export type MotionSpec = SpringSpec | TimingSpec;

/**
 * Reduce-motion gate for the press spring. When the OS reduce-motion setting is
 * on, degrade to an instant timing transition instead of a spring. Pure + tested.
 */
export function disableSpringForReducedMotion(reduceMotion: boolean, spec: SpringSpec): MotionSpec {
  return reduceMotion ? { type: "timing", duration: 0 } : spec;
}

/** The default press spring (opacity ~0.85 + scale 0.97 per the issue). */
export const PRESS_SPRING: SpringSpec = { type: "spring", damping: 18, stiffness: 320 };
