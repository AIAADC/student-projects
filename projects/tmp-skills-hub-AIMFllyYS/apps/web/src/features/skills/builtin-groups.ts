/** 与 cli-commands-v0 §5 / core BUILTIN_GROUPS 同口径。web 不 import core。 */
export const BUILTIN_GROUP_IDS = ["development", "design", "tooling", "writing", "research"] as const;

export function isBuiltinGroup(id: string): boolean {
  return (BUILTIN_GROUP_IDS as readonly string[]).includes(id);
}
