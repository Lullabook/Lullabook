import {
  FakeAnthropic,
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
import { PersonaService } from "@/services/persona";
import { SharingService } from "@/services/sharing";
import { StorybookService } from "@/services/storybook";
import { SubscriptionService } from "@/services/subscription";

export function createTestContext() {
  const store = new DataStore();
  const anthropic = new FakeAnthropic();
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
  const storybooks = new StorybookService(store, anthropic, fal, childSafety);
  const multiStorybooks = new StorybookService(store, anthropic, fal, childSafety, true);
  const sharing = new SharingService(store);
  const family = new FamilyService(store);
  const hardDelete = new HardDeleteService(store, blobs, notifications);
  const exportSvc = new ExportService(store, pdf);
  const coldStart = new ColdStartService(store, storybooks);
  const onboarding = new OnboardingService(store);

  return {
    store,
    anthropic,
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
    personas,
    storybooks,
    multiStorybooks,
    sharing,
    family,
    hardDelete,
    exportSvc,
    coldStart,
    onboarding,
  };
}

export function goodPhoto(seed = 0xaa): Buffer {
  const buf = Buffer.alloc(20_000);
  buf[0] = seed;
  buf[1] = 0x01;
  buf[2] = 0x00;
  return buf;
}
