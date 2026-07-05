import { describe, expect, it } from "vitest";
import { FakePersistentStorage } from "../infrastructure/persistence/FakePersistentStorage";
import { ensurePersistentStorage } from "./StoragePersistence";

describe("ensurePersistentStorage", () => {
  it("does not request when storage is already persisted", async () => {
    const storage = new FakePersistentStorage(true);

    const result = await ensurePersistentStorage(storage);

    expect(result).toEqual({ persisted: true, alreadyGranted: true });
    expect(storage.requestCount).toBe(0);
  });

  it("requests persistence when not yet granted, and reports the grant", async () => {
    const storage = new FakePersistentStorage(false, true);

    const result = await ensurePersistentStorage(storage);

    expect(result).toEqual({ persisted: true, alreadyGranted: false });
    expect(storage.requestCount).toBe(1);
  });

  it("reports a denied request without throwing", async () => {
    const storage = new FakePersistentStorage(false, false);

    const result = await ensurePersistentStorage(storage);

    expect(result).toEqual({ persisted: false, alreadyGranted: false });
    expect(storage.requestCount).toBe(1);
  });
});
