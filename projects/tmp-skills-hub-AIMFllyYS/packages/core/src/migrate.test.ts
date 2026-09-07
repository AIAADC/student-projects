import { describe, expect, test } from "vitest";
import { migrateVersionedData, type MigrationStep } from "./migrate.js";

interface TestFile {
  version: number;
  data: string;
  extra?: string;
}

const chain: MigrationStep<TestFile>[] = [
  { from: 1, to: 2, up: (d) => ({ ...d, extra: "added-in-v2" }) },
  { from: 2, to: 3, up: (d) => ({ ...d, data: d.data + "-migrated" }) },
];

describe("migrateVersionedData", () => {
  test("passes through when version matches current", () => {
    const input: TestFile = { version: 3, data: "hello" };
    const result = migrateVersionedData(input, { current: 3, chain, label: "test" });
    expect(result).toEqual({ version: 3, data: "hello" });
  });

  test("migrates v1 → v3 through chain", () => {
    const input: TestFile = { version: 1, data: "hello" };
    const result = migrateVersionedData(input, { current: 3, chain, label: "test" });
    expect(result.version).toBe(3);
    expect(result.extra).toBe("added-in-v2");
    expect(result.data).toBe("hello-migrated");
  });

  test("migrates v2 → v3 (partial chain)", () => {
    const input: TestFile = { version: 2, data: "hello", extra: "existing" };
    const result = migrateVersionedData(input, { current: 3, chain, label: "test" });
    expect(result.version).toBe(3);
    expect(result.extra).toBe("existing");
    expect(result.data).toBe("hello-migrated");
  });

  test("throws on downgrade (version > current)", () => {
    const input: TestFile = { version: 5, data: "hello" };
    expect(() => migrateVersionedData(input, { current: 3, chain, label: "test.json" })).toThrow(
      /版本过高.*5.*3/,
    );
  });

  test("throws when migration step is missing", () => {
    const input: TestFile = { version: 1, data: "hello" };
    expect(() =>
      migrateVersionedData(input, { current: 3, chain: [chain[1]!], label: "test.json" }),
    ).toThrow(/缺少.*v1/);
  });
});
