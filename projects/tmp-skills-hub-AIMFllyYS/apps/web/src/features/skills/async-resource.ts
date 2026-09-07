/**
 * 轻量请求缓存:飞行中去重 + 完成后按 key 复用 + 订阅者 Abort 不写结果。
 * 不引入 react-query。共享请求用引用计数,最后一个订阅者离开后才 abort,
 * 并用 microtask 推迟,避免 React StrictMode 先卸再挂时打出第二次请求。
 */

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException ? e.name === "AbortError" : e instanceof Error && e.name === "AbortError";
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

interface Inflight<T> {
  promise: Promise<T>;
  controller: AbortController;
  waiters: number;
}

const cache = new Map<string, unknown>();
const inflight = new Map<string, Inflight<unknown>>();

export function peekResource<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

export function invalidateResource(key: string): void {
  cache.delete(key);
}

export function invalidateResourcePrefix(prefix: string): void {
  for (const k of [...cache.keys()]) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

/** 测试用:清空缓存与飞行中请求。 */
export function resetResources(): void {
  for (const slot of inflight.values()) slot.controller.abort();
  inflight.clear();
  cache.clear();
}

export async function loadResource<T>(
  key: string,
  loader: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (cache.has(key)) return cache.get(key) as T;
  if (signal?.aborted === true) throw abortError();

  let slot = inflight.get(key) as Inflight<T> | undefined;
  if (slot === undefined) {
    const controller = new AbortController();
    const promise = loader(controller.signal).then(
      (value) => {
        cache.set(key, value);
        inflight.delete(key);
        return value;
      },
      (err: unknown) => {
        inflight.delete(key);
        throw err;
      },
    );
    slot = { promise, controller, waiters: 0 };
    inflight.set(key, slot);
  }
  slot.waiters += 1;

  const release = (): void => {
    slot.waiters -= 1;
    queueMicrotask(() => {
      const cur = inflight.get(key);
      if (cur !== undefined && cur.waiters <= 0) {
        cur.controller.abort();
        inflight.delete(key);
      }
    });
  };

  if (signal === undefined) {
    try {
      return await slot.promise;
    } finally {
      release();
    }
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      release();
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    slot.promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        if (signal.aborted) {
          release();
          reject(abortError());
          return;
        }
        release();
        resolve(value);
      },
      (err: unknown) => {
        signal.removeEventListener("abort", onAbort);
        release();
        reject(err);
      },
    );
  });
}

export function treeResourceKey(hash: string): string {
  return "tree:" + hash;
}

export function fileResourceKey(hash: string, relPath: string): string {
  return "file:" + hash + ":" + relPath;
}
