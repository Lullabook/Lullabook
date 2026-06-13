"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { seedDemoWorldAction } from "@/lib/actions";

/**
 * Dev-only affordance to inject the "Maya's World" demo dataset. Rendered only
 * when the server gate (`NODE_ENV=development` + `DEV_DEMO_SEED=true`) is on.
 */
export function DevSeedButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function load() {
    setMsg(null);
    startTransition(async () => {
      const res = await seedDemoWorldAction();
      if (!res.ok) return setMsg(res.error);
      setMsg(
        res.data.alreadySeeded
          ? "Family already populated."
          : `Loaded ${res.data.books} stories, ${res.data.personas} family, ${res.data.characters} characters.`
      );
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={load}
        disabled={pending}
        className="v2-btn v2-btn--outline"
        style={{ fontSize: "0.82rem", opacity: 0.85 }}
      >
        {pending ? "Loading…" : "🌱 Load example data (dev)"}
      </button>
      {msg && <span style={{ fontSize: "0.82rem", color: "#6E6076" }}>{msg}</span>}
    </div>
  );
}
