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
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useReducedMotion,
  runOnJS,
} from "react-native-reanimated";
import { getHaptics, PRESS_SPRING, type HapticsImpact, type HapticsNotification } from "./haptics";

type FeedbackKind = "impact" | "selection" | "notify";

type FeedbackPayload =
  | { kind: "impact"; style: HapticsImpact }
  | { kind: "selection" }
  | { kind: "notify"; type: HapticsNotification };

const NONE: FeedbackPayload = { kind: "selection" };

export function usePressFeedback(payload: FeedbackPayload = NONE) {
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);

  // The spring config is chosen on the JS thread (plain numbers) so the worklet
  // below never calls a non-worklet function on the UI runtime — doing so aborts
  // the process (SIGABRT), which unit tests can't catch. Only primitives cross
  // into the worklet closure.
  const { damping, stiffness } = PRESS_SPRING;

  const style = useAnimatedStyle(() => {
    // Opacity + scale both track `pressed.value` so the resting state is 1.0
    // (not 0.85) and the press visibly dims+scales to 0.85/0.97. Reduce-motion
    // collapses both transitions to instant (duration 0), including the scale.
    const scale = 1 - 0.03 * pressed.value;
    return {
      opacity: withTiming(1 - 0.15 * pressed.value, { duration: reduceMotion ? 0 : 80 }),
      transform: [
        {
          scale: reduceMotion
            ? withTiming(scale, { duration: 0 })
            : withSpring(scale, { damping, stiffness }),
        },
      ],
    };
  }, [reduceMotion, damping, stiffness]);

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
