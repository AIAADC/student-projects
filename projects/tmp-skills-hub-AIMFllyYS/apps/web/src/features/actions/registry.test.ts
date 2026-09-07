import { describe, expect, it } from "vitest";
import { ACTION_REGISTRY, getAction, type ActionId } from "./registry.js";

const CORE: ActionId[] = ["enable", "disable", "archive", "save", "translate"];

describe("ACTION_REGISTRY", () => {
  it("现有写动作都在表里,id 与动词稳定", () => {
    const ids = Object.keys(ACTION_REGISTRY);
    for (const id of CORE) expect(ids).toContain(id);
    expect(getAction("enable").verb).toBe("启用");
    expect(getAction("disable").verb).toBe("停用");
    expect(getAction("archive").verb).toBe("归档");
    expect(getAction("save").verb).toBe("保存");
    expect(getAction("translate").verb).toBe("翻译");
  });

  it("归档是破坏性;批量链接动作带预览", () => {
    for (const id of CORE) {
      const a = getAction(id);
      expect(a.destructive).toBe(id === "archive");
      expect(a.supportsPreview).toBe(false);
    }
    expect(getAction("preview-links").supportsPreview).toBe(true);
    expect(getAction("apply-links").supportsPreview).toBe(true);
    expect(getAction("apply-clean-links").supportsPreview).toBe(true);
    expect(getAction("apply-clean-links").verb).toBe("批量挂链");
    expect(getAction("adopt").verb).toBe("收录");
    expect(getAction("restore").verb).toBe("恢复");
    expect(getAction("restore").destructive).toBe(false);
    expect(getAction("create-group").verb).toBe("新建分组");
    expect(getAction("delete-group").destructive).toBe(true);
    expect(getAction("add-to-group").verb).toBe("挂到分组");
    expect(getAction("analyze").verb).toBe("分析");
    expect(getAction("analyze").destructive).toBe(false);
    expect(getAction("share").verb).toBe("分享");
    expect(getAction("share").destructive).toBe(false);
    expect(getAction("reset").verb).toBe("恢复到初始化前");
    expect(getAction("reset").destructive).toBe(true);
    expect(getAction("reset").supportsPreview).toBe(true);
    expect(getAction("restore").id).not.toBe("reset");
    expect(getAction("create").verb).toBe("新建");
    expect(getAction("create").destructive).toBe(false);
    expect(getAction("create").supportsPreview).toBe(false);
  });
});
