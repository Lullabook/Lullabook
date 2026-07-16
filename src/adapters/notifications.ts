import webpush from "web-push";
import type { NotificationAdapter } from "@/adapters/types";
import { optionalEnv, requireEnv } from "@/adapters/env";

// DECISION: Resend for transactional email (single REST call, no SDK) and the
// `web-push` library for VAPID web push — the stack.md "email + web push"
// async-notify pair for "Persona ready" / "Storybook ready".
const RESEND_API_URL = "https://api.resend.com/emails";

export interface PushSubscriptionStore {
  /** Returns the stored web-push subscriptions for a Member. */
  getSubscriptionsForMember(memberId: string): Promise<
    { endpoint: string; keys: { p256dh: string; auth: string } }[]
  >;
}

/**
 * Dev-only notifications: logs the intent and never throws. Selected by
 * `selectNotificationAdapter()` (ADR-0010 moderation precedent) when
 * RESEND_API_KEY is absent outside production, so the inline persona-training
 * workflow (LocalDevWorkflowAdapter + DEV_FAL_FALLBACK) can complete a
 * `POST /api/personas` request without Resend. Never selected in production.
 * Logs recipient + subject only — no body content, no secrets.
 */
export class ConsoleDevNotificationAdapter implements NotificationAdapter {
  async sendEmail(to: string, subject: string, _body: string): Promise<void> {
    console.info(`[dev-notifications] email to=${to} subject="${subject}" (not sent)`);
  }

  async sendWebPush(memberId: string, title: string, _body: string): Promise<void> {
    console.info(`[dev-notifications] push member=${memberId} title="${title}" (not sent)`);
  }
}

export class RealNotificationAdapter implements NotificationAdapter {
  constructor(private readonly pushSubscriptions?: PushSubscriptionStore) {}

  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireEnv("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: optionalEnv("EMAIL_FROM") ?? "Lullabook <hello@lullabook.app>",
        to: [to],
        subject,
        text: body,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Email send failed (${res.status}): ${detail.slice(0, 300)}`);
    }
  }

  async sendWebPush(memberId: string, title: string, body: string): Promise<void> {
    if (!this.pushSubscriptions) return;
    webpush.setVapidDetails(
      optionalEnv("VAPID_SUBJECT") ?? "mailto:hello@lullabook.app",
      requireEnv("VAPID_PUBLIC_KEY"),
      requireEnv("VAPID_PRIVATE_KEY")
    );
    const subscriptions = await this.pushSubscriptions.getSubscriptionsForMember(memberId);
    await Promise.all(
      subscriptions.map((sub) =>
        webpush
          .sendNotification(sub, JSON.stringify({ title, body }))
          // An expired subscription is routine; never fail the workflow on it.
          .catch(() => undefined)
      )
    );
  }
}
