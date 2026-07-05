/**
 * Honest fake of the PersistentStorage port: models the browser's grant state
 * and records how many times a request was actually made, so tests can assert
 * the "request only once" behaviour.
 */

import type { PersistentStorage } from "../../application/ports/PersistentStorage";

export class FakePersistentStorage implements PersistentStorage {
  requestCount = 0;

  constructor(
    private persisted: boolean,
    /** What a request resolves to (the browser may deny). */
    private readonly grantOnRequest = true,
  ) {}

  isPersisted(): Promise<boolean> {
    return Promise.resolve(this.persisted);
  }

  requestPersist(): Promise<boolean> {
    this.requestCount++;
    if (this.grantOnRequest) this.persisted = true;
    return Promise.resolve(this.persisted);
  }
}
