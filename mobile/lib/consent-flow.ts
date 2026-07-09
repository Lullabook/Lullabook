/**
 * Issue 173 (ADR-0018, FAIL-4, SEC-4) — mobile Email-Plus consent flow
 * state machine.
 *
 * The server owns ALL consent semantics (the "plus" second confirmation,
 * revoke, the 172 createBaby gate). Mobile only walks:
 *
 *   attest ──send──▶ pending ──poll: verified──▶ verified (upload unlocks)
 *     ▲                │
 *     └──send failed───┘   FAIL-4: retryable error, Household stays
 *                          unverified, baby creation stays blocked —
 *                          fail closed (SEC-4). Nothing client-side ever
 *                          marks the flow verified; only the server status.
 *
 * `resume()` re-derives the step from the server so closing the app mid-flow
 * reopens at the right place (pending vs verified vs attest), never a dead end.
 *
 * Dependency-free on purpose (like purchase-controller.ts) so the root
 * vitest suite can drive it directly. Live wiring lives in mobile/app/consent.tsx.
 */

export type ConsentStatusWire =
  | { status: "none" }
  | { status: "pending"; email?: string }
  | { status: "verified" };

export type ConsentFlowStep =
  | { step: "attest" }
  | { step: "sending"; email: string }
  | { step: "send_failed"; email: string; error: string }
  | { step: "pending"; email: string | null }
  | { step: "verified" };

export interface ConsentFlowDeps {
  /** POST /api/consent/email-plus/request — server sends the link. */
  requestConsent(email: string): Promise<{ status: string }>;
  /** GET /api/consent/email-plus/status — server-authoritative resume/poll. */
  fetchStatus(): Promise<ConsentStatusWire>;
}

export class ConsentFlowController {
  private current: ConsentFlowStep = { step: "attest" };
  private listeners = new Set<(s: ConsentFlowStep) => void>();

  constructor(private readonly deps: ConsentFlowDeps) {}

  get state(): ConsentFlowStep {
    return this.current;
  }

  subscribe(fn: (s: ConsentFlowStep) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(next: ConsentFlowStep): void {
    this.current = next;
    for (const fn of this.listeners) fn(next);
  }

  /**
   * Resume from server truth. Any fetch failure lands on "attest" (the user
   * can always re-send from there — a send to an already-pending Household
   * is safe server-side), never a dead end.
   */
  async resume(): Promise<ConsentFlowStep> {
    try {
      const wire = await this.deps.fetchStatus();
      if (wire.status === "verified") this.set({ step: "verified" });
      else if (wire.status === "pending")
        this.set({ step: "pending", email: wire.email ?? null });
      else this.set({ step: "attest" });
    } catch {
      this.set({ step: "attest" });
    }
    return this.current;
  }

  /**
   * Attest + send. FAIL-4: on failure (Resend down / network) the step is
   * "send_failed" with the email kept for one-tap retry; the Household stays
   * unverified and the 172 gate keeps blocking — this controller never
   * advances past "pending" on its own say-so.
   */
  async send(email: string): Promise<ConsentFlowStep> {
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      this.set({
        step: "send_failed",
        email,
        error: "Please enter a valid email address",
      });
      return this.current;
    }
    this.set({ step: "sending", email: trimmed });
    try {
      await this.deps.requestConsent(trimmed);
      this.set({ step: "pending", email: trimmed });
    } catch (err) {
      this.set({
        step: "send_failed",
        email: trimmed,
        error:
          err instanceof Error
            ? err.message
            : "We couldn't send the email — please try again",
      });
    }
    return this.current;
  }

  /**
   * One poll tick. Only a server "verified" advances the flow (SEC-4);
   * poll errors keep the current step (they never regress a pending state
   * or fabricate verification).
   */
  async poll(): Promise<ConsentFlowStep> {
    try {
      const wire = await this.deps.fetchStatus();
      if (wire.status === "verified") this.set({ step: "verified" });
    } catch {
      // transient — keep waiting; the next tick retries.
    }
    return this.current;
  }
}
