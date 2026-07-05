import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../../domain/Result";
import { InMemoryBlobStore } from "./InMemoryBlobStore";
import { InMemoryKeyValueStore } from "./InMemoryKeyValueStore";

describe("InMemoryBlobStore (BlobStore contract)", () => {
  it("round-trips bytes by key", async () => {
    const store = new InMemoryBlobStore();
    await store.put("a", new Uint8Array([1, 2, 3]));

    const got = await store.get("a");

    expect(isOk(got)).toBe(true);
    if (isOk(got)) expect([...got.value]).toEqual([1, 2, 3]);
  });

  it("returns NotFound for an unknown key", async () => {
    const store = new InMemoryBlobStore();
    expect(isErr(await store.get("missing"))).toBe(true);
  });

  it("isolates stored bytes from caller mutation", async () => {
    const store = new InMemoryBlobStore();
    const input = new Uint8Array([1, 2, 3]);
    await store.put("a", input);
    input[0] = 99;

    const got = await store.get("a");
    if (isOk(got)) expect(got.value[0]).toBe(1);
  });

  it("lists keys by prefix", async () => {
    const store = new InMemoryBlobStore();
    await store.put("w1/0,0,0", new Uint8Array([1]));
    await store.put("w1/1,0,0", new Uint8Array([2]));
    await store.put("w2/0,0,0", new Uint8Array([3]));

    const keys = await store.keys("w1/");

    expect(isOk(keys)).toBe(true);
    if (isOk(keys)) expect([...keys.value].sort()).toEqual(["w1/0,0,0", "w1/1,0,0"]);
  });

  it("deletes a key and reports NotFound on a second delete", async () => {
    const store = new InMemoryBlobStore();
    await store.put("a", new Uint8Array([1]));

    expect(isOk(await store.delete("a"))).toBe(true);
    expect(isErr(await store.delete("a"))).toBe(true);
  });
});

describe("InMemoryKeyValueStore (KeyValueStore contract)", () => {
  it("round-trips a string value", async () => {
    const store = new InMemoryKeyValueStore();
    await store.put("k", "value");

    const got = await store.get("k");

    expect(isOk(got)).toBe(true);
    if (isOk(got)) expect(got.value).toBe("value");
  });

  it("returns NotFound for an unknown key", async () => {
    const store = new InMemoryKeyValueStore();
    expect(isErr(await store.get("missing"))).toBe(true);
  });

  it("lists keys by prefix", async () => {
    const store = new InMemoryKeyValueStore();
    await store.put("world:a", "1");
    await store.put("world:b", "2");
    await store.put("other:c", "3");

    const keys = await store.keys("world:");

    expect(isOk(keys)).toBe(true);
    if (isOk(keys)) expect([...keys.value].sort()).toEqual(["world:a", "world:b"]);
  });

  it("deletes a key and reports NotFound on a second delete", async () => {
    const store = new InMemoryKeyValueStore();
    await store.put("k", "v");

    expect(isOk(await store.delete("k"))).toBe(true);
    expect(isErr(await store.delete("k"))).toBe(true);
  });
});
