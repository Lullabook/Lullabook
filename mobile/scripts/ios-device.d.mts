/**
 * Type declarations for `ios-device.mjs` (issue 208 / local ticket 200).
 * Mirrors the JSDoc in the module so the root typecheck resolves the `.mjs`
 * import from `tests/200-ios-device-launch-script.test.ts`.
 */

export const DEV_BACKEND_PORT: number;

export interface IosDeviceStep {
  name: string;
  command: string;
}

export type IosDevicePlan =
  | {
      ok: true;
      address: string;
      env: Record<string, string>;
      steps: IosDeviceStep[];
    }
  | {
      ok: false;
      error: string;
      env: Record<string, string>;
      steps: never[];
    };

export function planIosDeviceRun(input: {
  address: string | null;
  iosDirExists: boolean;
}): IosDevicePlan;