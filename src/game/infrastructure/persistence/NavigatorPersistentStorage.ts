/**
 * Real PersistentStorage adapter over the Storage API. Thin, untested glue: the
 * decision logic lives in the tested `ensurePersistentStorage` use case. Degrades
 * to "not persisted" where the API is absent rather than throwing.
 */

import type { PersistentStorage } from "../../application/ports/PersistentStorage";

export class NavigatorPersistentStorage implements PersistentStorage {
  private get storage(): StorageManager | undefined {
    return typeof navigator !== "undefined" ? navigator.storage : undefined;
  }

  async isPersisted(): Promise<boolean> {
    const s = this.storage;
    return s?.persisted ? s.persisted() : false;
  }

  async requestPersist(): Promise<boolean> {
    const s = this.storage;
    return s?.persist ? s.persist() : false;
  }
}
