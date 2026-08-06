/**
 * Dev CLI: inject the "Maya's World" demo dataset into the Supabase-backed app
 * for an existing signed-in family. Idempotent (bails if the family already has
 * storybooks).
 *
 * Usage:
 *   DEV_DEMO_SEED=true npx tsx tools/seed-demo.ts <authUserId>
 *
 * <authUserId> is the Supabase auth user id of a Guardian Member whose family
 * you want to populate (find it in the Supabase dashboard → Authentication).
 * Requires the same Supabase service env the app uses (.env.local).
 */
import { createRequestContext } from "@/lib/context";
import { seedMayaWorldRuntime } from "@/dev/seed-maya-world";

async function main() {
  if (process.env.DEV_DEMO_SEED !== "true") {
    throw new Error("Refusing to run: set DEV_DEMO_SEED=true to enable the demo seed.");
  }
  const authUserId = process.argv[2];
  if (!authUserId) {
    throw new Error("Usage: DEV_DEMO_SEED=true npx tsx tools/seed-demo.ts <authUserId>");
  }

  const ctx = createRequestContext();
  const member = await ctx.store.hydrateByAuthUser(authUserId);
  if (!member) {
    throw new Error(`No Member found for auth user ${authUserId}`);
  }

  const result = await seedMayaWorldRuntime(ctx, member);
  if (result.alreadySeeded) {
    console.log("Family already has storybooks — seed skipped (idempotent).");
  } else {
    console.log(
      `Seeded Lullabook demo: ${result.personas} personas, ${result.characters} characters, ${result.books} stories.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
