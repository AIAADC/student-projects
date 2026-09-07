import { afterEach, describe, expect, it } from "vitest";
import { invalidateResource, loadResource, peekResource, resetResources } from "./async-resource.js";

afterEach(() => {
  resetResources();
});

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("loadResource", () => {
  it("同一 key 飞行中只跑一次 loader", async () => {
    const d = deferred<string>();
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return d.promise;
    };
    const a = loadResource("k", loader);
    const b = loadResource("k", loader);
    d.resolve("ok");
    expect(await a).toBe("ok");
    expect(await b).toBe("ok");
    expect(calls).toBe(1);
  });

  it("完成后命中缓存,不再调用 loader", async () => {
    let calls = 0;
    const first = await loadResource("cached", async () => {
      calls += 1;
      return 1;
    });
    const second = await loadResource("cached", async () => {
      calls += 1;
      return 2;
    });
    expect(first).toBe(1);
    expect(second).toBe(1);
    expect(calls).toBe(1);
    expect(peekResource<number>("cached")).toBe(1);
  });

  it("订阅者 abort 后不拿到结果,共享请求仍交给其他订阅者", async () => {
    const d = deferred<string>();
    const ac = new AbortController();
    let calls = 0;
    const loader = async (): Promise<string> => {
      calls += 1;
      return d.promise;
    };
    const aborted = loadResource("shared", loader, ac.signal);
    const kept = loadResource("shared", loader);
    ac.abort();
    await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
    d.resolve("body");
    expect(await kept).toBe("body");
    expect(calls).toBe(1);
  });

  it("invalidate 后下次重新加载", async () => {
    await loadResource("x", async () => "a");
    invalidateResource("x");
    const next = await loadResource("x", async () => "b");
    expect(next).toBe("b");
  });
});
