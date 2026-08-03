/** Private, session-scoped request state. No response cache survives sign-out. */
export class SharedRequestCache<T> {
  private value: T | undefined;
  private hasValue = false;
  private inFlight: Promise<T> | undefined;
  private generation = 0;

  get(loader: () => Promise<T>) {
    if (this.hasValue) return Promise.resolve(this.value as T);
    if (this.inFlight) return this.inFlight;

    const generation = this.generation;
    const request = loader().then((value) => {
      if (generation === this.generation) {
        this.value = value;
        this.hasValue = true;
      }
      return value;
    });
    this.inFlight = request.finally(() => {
      if (generation === this.generation) this.inFlight = undefined;
    });
    return this.inFlight;
  }

  refresh(loader: () => Promise<T>) {
    this.clear();
    return this.get(loader);
  }

  clear() {
    this.generation += 1;
    this.value = undefined;
    this.hasValue = false;
    this.inFlight = undefined;
  }
}

export function createSharedRequestCache<T>() {
  return new SharedRequestCache<T>();
}

const privateCacheClearers = new Set<() => void>();

export function registerPrivateCache(clear: () => void) {
  privateCacheClearers.add(clear);
  return () => privateCacheClearers.delete(clear);
}

/** Clear every in-memory private read cache at the auth/session boundary. */
export function clearPrivateCaches() {
  for (const clear of privateCacheClearers) clear();
}
