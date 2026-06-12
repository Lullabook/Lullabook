import { NextResponse } from "next/server";
import { EVENTS, inngest } from "@/adapters/inngest";

interface FalWebhookBody {
  request_id?: string;
  status?: string;
  payload?: {
    diffusers_lora_file?: { url?: string };
    lora_file?: { url?: string };
  } | null;
}

/**
 * fal.ai training completion webhook → re-emitted as the Inngest event the
 * parked `wait-for-training` step is matching on (`async.data.jobId`). The
 * webhook itself stays dumb: no DB writes here, the durable workflow owns
 * all state transitions.
 */
export async function POST(req: Request): Promise<NextResponse> {
  let body: FalWebhookBody;
  try {
    body = (await req.json()) as FalWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.request_id) {
    return NextResponse.json({ error: "Missing request_id" }, { status: 400 });
  }

  const loraWeightKey =
    body.payload?.diffusers_lora_file?.url ?? body.payload?.lora_file?.url;
  await inngest.send({
    name: EVENTS.falTrainingComplete,
    data: {
      jobId: body.request_id,
      status: body.status === "OK" ? "ready" : "failed",
      loraWeightKey,
    },
  });
  return NextResponse.json({ received: true });
}
