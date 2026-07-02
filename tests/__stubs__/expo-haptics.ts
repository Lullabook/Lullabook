// Test-only stub for `expo-haptics` so the haptics adapter's pure decision
// logic can be exercised in the server-side Vitest environment (node, no RN)
// without pulling in react-native. Mirrors the public surface used by
// mobile/lib/haptics.ts. NOT shipped — vitest alias points here in test runs only.
export enum ImpactFeedbackStyle {
  Light = "light",
  Medium = "medium",
  Heavy = "heavy",
  Rigid = "rigid",
  Soft = "soft",
}

export enum NotificationFeedbackType {
  Success = "success",
  Warning = "warning",
  Error = "error",
}

export async function impactAsync(): Promise<void> {}
export async function notificationAsync(): Promise<void> {}
export async function selectionAsync(): Promise<void> {}
