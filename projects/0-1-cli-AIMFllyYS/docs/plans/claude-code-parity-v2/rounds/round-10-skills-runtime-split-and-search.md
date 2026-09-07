# Round 10: Skills Runtime Split And Search Handoff

## Copy This Prompt To Cursor

```text
你在 D:\new_project\My-CLI 工作。只执行 Round 10: Skills Runtime Split And Search。

先读 AGENTS.md 和 docs/plans/claude-code-parity-v2 下的 README、00、01、02、04，以及本文件。
精读 Claude Code skills loader/search/SkillTool 源码。技能内容只能作为 contextual reference，不能升级为高优先级 system instruction。
```

## Goal

Split skills into focused modules and port Claude Code search/metadata behavior.

## Claude Sources

- `src/skills/loadSkillsDir.ts`
- `src/skills/bundledSkills.ts`
- `src/services/skillSearch/*`
- `src/commands/skills/index.js`
- `src/tools/SkillTool/SkillTool.ts`
- `src/tools/SkillTool/prompt.ts`

## My-CLI Files

- Create: `src/chat/skills/discovery.ts`
- Create: `src/chat/skills/frontmatter.ts`
- Create: `src/chat/skills/runtime.ts`
- Create: `src/chat/skills/search.ts`
- Create: `src/chat/skills/format.ts`
- Modify: `src/chat/skills.ts`
- Modify: `src/chat/commands.ts`
- Test: `tests/ai-skills-runtime.test.js`
- Test: `tests/skills-registry.test.js`

## Required Behavior

- Metadata discovery reads only a prefix.
- Full content loads on demand.
- Frontmatter supports known fields used by local skills.
- Search ranks ID, name, description, and trigger text.
- Active skill context remains user-role contextual material.
- Chinese SKILL.md content is preserved.

## Verification

```powershell
npm run build
node --test tests/ai-skills-runtime.test.js tests/skills-registry.test.js
node --test --test-concurrency=1 .\tests\*.test.js
```

## Commit

```powershell
git add src/chat/skills.ts src/chat/skills src/chat/commands.ts tests/ai-skills-runtime.test.js tests/skills-registry.test.js
git commit -m "feat(ai): split and search runtime skills"
```
