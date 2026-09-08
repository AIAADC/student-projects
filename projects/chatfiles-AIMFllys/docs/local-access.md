# 午夜书斋本地只读接入

ChatFiles 提供三种本地读取方式：回环 HTTP、命令行 CLI、MCP stdio。它们复用同一组只读领域服务与限额，不提供删除、移动、改写、归档或解密能力，也不会返回数据库路径、文件绝对路径、API Key 或本地令牌。

## 安全边界

- 网站服务只绑定 `127.0.0.1`，不要改成 `0.0.0.0` 或公网地址。
- HTTP 可用环境变量 `CHATFILES_LOCAL_TOKEN` 启用 Bearer 校验；令牌只从进程环境读取。
- CLI 只接受 `http://127.0.0.1`、`http://localhost` 或 `http://[::1]` 地址，避免把令牌发往远端。
- MCP 使用 stdio 子进程，不监听新端口，也不向 stdout 写日志。
- 列表默认 20 条、最多 100 条；消息上下文半径最多 20；文档正文最多 50,000 个字符。
- 文档只能按 64 位文件资产 ID 读取，不能传入路径。

## 启动 HTTP 服务

无令牌时仅依赖回环监听：

```powershell
npm start
```

建议为本机自动化设置随机令牌：

```powershell
$env:CHATFILES_LOCAL_TOKEN = '<本地随机令牌>'
npm start
```

### HTTP 示例

PowerShell：

```powershell
$headers = @{ Authorization = 'Bearer <本地随机令牌>' }
Invoke-RestMethod 'http://127.0.0.1:3456/api/local/v1/status' -Headers $headers
Invoke-RestMethod 'http://127.0.0.1:3456/api/local/v1/conversations?query=%E9%A1%B9%E7%9B%AE&limit=20' -Headers $headers
Invoke-RestMethod 'http://127.0.0.1:3456/api/local/v1/search?q=%E5%86%B3%E7%AD%96&limit=20' -Headers $headers
Invoke-RestMethod 'http://127.0.0.1:3456/api/local/v1/artifacts?q=%E8%AF%B4%E6%98%8E&category=document&limit=20' -Headers $headers
Invoke-RestMethod 'http://127.0.0.1:3456/api/local/v1/documents/<64位文件资产ID>?maxChars=12000' -Headers $headers
Invoke-RestMethod 'http://127.0.0.1:3456/api/local/v1/messages/<消息UID>/context?radius=8' -Headers $headers
```

curl：

```bash
curl -H "Authorization: Bearer <本地随机令牌>" "http://127.0.0.1:3456/api/local/v1/search?q=%E5%86%B3%E7%AD%96&limit=20"
```

常用稳定错误码包括 `invalid_local_request`、`local_unauthorized`、`local_not_found`、`database_unavailable` 和 `operation_failed`。错误响应不会附带内部路径或原始异常。

## CLI

CLI 默认访问 `http://127.0.0.1:3456`，因此先启动网站服务。若设置了 `CHATFILES_LOCAL_TOKEN`，CLI 会自动携带同名环境变量。`--json` 输出单行 UTF-8 JSON，适合本地 Agent 或脚本处理。

```powershell
npm run chatfiles -- status --json
npm run chatfiles -- conversations --query '项目' --limit 20 --json
npm run chatfiles -- search '最终决定' --conversation '<会话ID>' --sender '<发送者ID>' --json
npm run chatfiles -- artifacts '说明文档' --category document --json
npm run chatfiles -- read-document '<64位文件资产ID>' --max-chars 12000 --json
npm run chatfiles -- message-context '<消息UID>' --radius 8 --json
```

输入错误退出码为 `2`，服务或网络错误退出码为 `1`，成功为 `0`。错误输出只包含稳定中文提示。

## MCP stdio

直接运行：

```powershell
npm run mcp
```

通用 MCP 客户端配置：

```json
{
  "mcpServers": {
    "chatfiles": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "<ChatFiles项目目录>"
    }
  }
}
```

可用工具：

- `chatfiles_status`
- `chatfiles_list_conversations`
- `chatfiles_search_messages`
- `chatfiles_search_artifacts`
- `chatfiles_read_document`
- `chatfiles_get_message_context`

所有工具都声明 `readOnlyHint: true`、`destructiveHint: false`、`idempotentHint: true`、`openWorldHint: false`，使用严格 Zod 输入 schema，同时返回文本内容与 `structuredContent`。annotations 是客户端提示；真正的安全边界仍由服务端只读实现、ID 校验、数据库只读打开和文件允许根校验共同保证。
