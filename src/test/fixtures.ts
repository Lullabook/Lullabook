import {
  FakeAnthropic,
  FakeClassicCatalog,
  FakeFal,
  FakeLiveness,
  FakeModeration,
  FakeNotifications,
  FakePdf,
  FakeStripe,
  FakeWorkflow,
  InMemoryBlobStore,
} from "@/adapters/fakes";
import { DataStore } from "@/db/store";
import { ChildSafetyService } from "@/services/child-safety";
import { ColdStartService } from "@/services/cold-start";
import { ExportService } from "@/services/export";
import { FamilyService } from "@/services/family";
import { HardDeleteService } from "@/services/hard-delete";
import { OnboardingService } from "@/services/onboarding";
import { CharacterService } from "@/services/character";
import { PersonaService } from "@/services/persona";
import { SharingService } from "@/services/sharing";
import { StorybookService } from "@/services/storybook";
import { SubscriptionService } from "@/services/subscription";
import { TextStoryService } from "@/services/text-story";

export function createTestContext() {
  const store = new DataStore();
  const anthropic = new FakeAnthropic();
  const classicCatalog = new FakeClassicCatalog();
  const fal = new FakeFal();
  const moderation = new FakeModeration();
  const liveness = new FakeLiveness();
  const blobs = new InMemoryBlobStore();
  const workflow = new FakeWorkflow();
  const notifications = new FakeNotifications();
  const stripe = new FakeStripe();
  const pdf = new FakePdf();

  const childSafety = new ChildSafetyService(store, moderation);
  const subscriptions = new SubscriptionService(store, stripe);
  const personas = new PersonaService(
    store,
    fal,
    liveness,
    moderation,
    blobs,
    workflow,
    notifications,
    subscriptions,
    childSafety
  );
  const characters = new CharacterService(store, personas);
  const storybooks = new StorybookService(
    store,
    anthropic,
    fal,
    childSafety,
    blobs,
    workflow,
    subscriptions,
    classicCatalog
  );
  const multiStorybooks = new StorybookService(
    store,
    anthropic,
    fal,
    childSafety,
    blobs,
    workflow,
    subscriptions,
    classicCatalog,
    true
  );
  const sharing = new SharingService(store);
  const family = new FamilyService(store);
  const hardDelete = new HardDeleteService(store, blobs, notifications);
  const exportSvc = new ExportService(store, pdf);
  const coldStart = new ColdStartService(store, storybooks);
  const onboarding = new OnboardingService(store);
  const textStories = new TextStoryService(store, anthropic, childSafety);

  return {
    store,
    anthropic,
    classicCatalog,
    fal,
    moderation,
    liveness,
    blobs,
    workflow,
    notifications,
    stripe,
    pdf,
    childSafety,
    subscriptions,
    characters,
    personas,
    storybooks,
    multiStorybooks,
    sharing,
    family,
    hardDelete,
    exportSvc,
    coldStart,
    onboarding,
    textStories,
  };
}

export function withActiveSubscription(
  ctx: ReturnType<typeof createTestContext>,
  member: { familyId: string; id: string }
) {
  ctx.subscriptions.handleCheckoutCompleted(member.familyId, `cus_${member.id}`, `sub_${member.id}`);
}

export async function generateAndWait(
  ctx: ReturnType<typeof createTestContext>,
  memberId: string,
  brief: import("@/domain/types").Brief
) {
  const book = await ctx.storybooks.generate(memberId, brief);
  await ctx.workflow.drain();
  return ctx.store.getStorybook(book.id, memberId)!;
}

export function goodPhoto(seed = 0xaa): Buffer {
  const buf = Buffer.alloc(20_000);
  buf[0] = seed;
  buf[1] = 0x01;
  buf[2] = 0x00;
  return buf;
}
