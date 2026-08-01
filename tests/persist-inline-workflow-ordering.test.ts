/**
 * `persist()` must sync the work an INLINE workflow does during flush.
 *
 * Live-audit finding (2026-07-31): a Storybook generated end-to-end returned
 * `{"status":"draft"}` from `POST /api/storybooks`, but the persisted row said
 * `generating` and the `pages` table stayed empty — every generated Story was
 * unreadable, and the book sat stranded in `generating` forever. That is a
 * direct violation of the Generation terminal state invariant (CONTEXT.md:
 * "a Storybook generation always ends `draft`|`failed`, never stranded in
 * `generating`").
 *
 * Cause is ordering in the composition root (`src/lib/context.ts`):
 *
 *     await store.sync();       // <- writes the map as it stands
 *     await workflow.flush();   // <- LocalDevWorkflowAdapter DRAINS JOBS HERE
 *
 * `LocalDevWorkflowAdapter.flush()` calls `drain()`, running the queued
 * generation inline against this same request's store. Those mutations — the
 * terminal status and every Page — land after the only sync, so they are never
 * written. The in-memory book reaches `draft` (which is what the route
 * serialized into the response), the database keeps `generating`.
 *
 * The ordering is correct for production: `InngestWorkflowAdapter.flush()`
 * only sends events, and a remote worker must not read state that hasn't been
 * committed yet. So the fix is not to swap the two calls — it is to sync a
 * second time when, and only when, the adapter ran the work locally.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CONTEXT_SRC = readFileSync(path.join(process.cwd(), "src/lib/context.ts"), "utf8");
const ADAPTER_SRC = readFileSync(
  path.join(process.cwd(), "src/lib/create-workflow-adapter.ts"),
  "utf8",
);

/** The body of `persist()` in the composition root. */
function persistBody(): string {
  const at = CONTEXT_SRC.indexOf("async persist(");
  expect(at).toBeGreaterThan(-1);
  const open = CONTEXT_SRC.indexOf("{", at);
  let depth = 0;
  let i = open;
  for (; i < CONTEXT_SRC.length; i++) {
    if (CONTEXT_SRC[i] === "{") depth++;
    else if (CONTEXT_SRC[i] === "}" && --depth === 0) break;
  }
  return CONTEXT_SRC.slice(open, i + 1);
}

/**
 * The composition root calls sync/flush through one-line aliases
 * (`persistStore` / `dispatchWorkflow`) so `ColdStartService` can share them.
 * Accept either spelling — but only after proving each alias still means what
 * its name says, so a rename to something *different* cannot pass silently.
 */
const SYNC_CALL = /(?:store\.sync\(\)|persistStore\(\))/g;
const DISPATCH_CALL = /(?:workflow\.flush\(\)|dispatchWorkflow\(\))/;

describe("persist() — inline workflow ordering", () => {
  it("the premise still holds: the local adapter drains jobs inside flush()", () => {
    // If this ever stops being true the second sync can go away.
    expect(ADAPTER_SRC).toMatch(/async flush\(\)[\s\S]{0,120}?this\.drain\(\)/);
  });

  it("the aliases still mean store.sync() and workflow.flush()", () => {
    expect(CONTEXT_SRC).toMatch(/const persistStore = async \(\) => store\.sync\(\);/);
    expect(CONTEXT_SRC).toMatch(/const dispatchWorkflow = async \(\) => workflow\.flush\(\);/);
  });

  it("syncs again after flush, so inline job output is persisted", () => {
    const body = persistBody();
    const flushAt = body.search(DISPATCH_CALL);
    expect(flushAt).toBeGreaterThan(-1);
    // At least one sync must come AFTER the dispatch.
    const syncsAfterFlush = [...body.slice(flushAt).matchAll(SYNC_CALL)];
    expect(syncsAfterFlush.length).toBeGreaterThan(0);
  });

  it("still syncs BEFORE flush, so a remote worker never reads uncommitted state", () => {
    const body = persistBody();
    const flushAt = body.search(DISPATCH_CALL);
    const syncsBeforeFlush = [...body.slice(0, flushAt).matchAll(SYNC_CALL)];
    expect(syncsBeforeFlush.length).toBeGreaterThan(0);
  });

  it("the second sync is gated on the inline adapter, not paid in production", () => {
    const body = persistBody();
    const flushAt = body.search(DISPATCH_CALL);
    expect(body.slice(flushAt)).toMatch(/LocalDevWorkflowAdapter/);
  });
});
