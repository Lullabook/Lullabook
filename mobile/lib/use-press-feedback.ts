/**
 * Issue 136 — Shared press-feedback hook for maya-ui pressables.
 *
 * Centralizes the press animation (opacity ~0.85 + spring scale 0.97 via
 * reanimated) + haptics firing so PrimaryButton / GhostButton / Chip / BackPill
 * inherit polish for free. Invariants:
 *  - reduce-motion ON → spring degrades to instant transition (no spring).
 *  - haptics unavailable → no-op, never throws (fail-open).
 *  - press latency < 50ms at 60fps (reanimated worklet, UI thread).
 */
import { useCallback } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useReducedMotion,
  runOnJS,
} from "react-native-reanimated";
import { getHaptics, PRESS_SPRING, disableSpringForReducedMotion, type HapticsImpact, type HapticsNotification } from "./haptics";

type FeedbackKind = "impact" | "selection" | "notify";

type FeedbackPayload =
  | { kind: "impact"; style: HapticsImpact }
  | { kind: "selection" }
  | { kind: "notify"; type: HapticsNotification };

const NONE: FeedbackPayload = { kind: "selection" };

export function usePressFeedback(payload: FeedbackPayload = NONE) {
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);

  const style = useAnimatedStyle(() => {
    // Opacity + scale both track `pressed.value` so the resting state is 1.0
    // (not 0.85) and the press visibly dims+scales to 0.85/0.97. Reduce-motion
    // collapses the transitions to instant (duration 0).
    const spec = disableSpringForReducedMotion(reduceMotion, PRESS_SPRING);
    return {
      opacity: withTiming(1 - 0.15 * pressed.value, { duration: reduceMotion ? 0 : 80 }),
      transform: [{ scale: withSpring(1 - 0.03 * pressed.value, spec) }],
    };
  }, [reduceMotion]);

  const fire = useCallback(() => {
    const h = getHaptics();
    if (payload.kind === "impact") void h.impact(payload.style);
    else if (payload.kind === "notify") void h.notify(payload.type);
    else void h.selection();
  }, [payload]);

  const onPressIn = useCallback(() => {
    pressed.value = 1;
    runOnJS(fire)();
  }, [fire]);
  const onPressOut = useCallback(() => {
    pressed.value = 0;
  }, []);

  return { style, onPressIn, onPressOut };
}

export type { FeedbackKind };
