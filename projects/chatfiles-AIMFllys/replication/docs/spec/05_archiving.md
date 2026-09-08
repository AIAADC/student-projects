# 文件库与资产归档补充说明

> 文档状态：补充说明；现行架构、字段、能力和激活规则以 [01_architecture.md](01_architecture.md) 为唯一 prose 权威。

## 两类产物

- `library`：用户明确纳入索引的只读文件副本及其 manifest。
- `assets`：由聊天消息证据关联的资源、候选、来源和物化结果。

两者不能因为文件名、大小或路径相似而互相冒充。聊天资源只有 `exact + confirmed` 才能进入普通素材；partial、conflict、missing 与 unconfirmed 均进入 quarantine。

## 文件证据

- `packed_info` hash 是 lookup evidence，不是内容摘要。
- SHA-256 只能在读取实际文件内容后称为 content digest。
- 稳定资产 ID 由消息 UID、规范资源证据、kind 和 data index 组成。
- 同大小替换必须由 content digest 检出。
- account root、owner、source run 和 snapshot 必须精确绑定，禁止猜测“最大数据库”。

## 只读与物化

原始文件只读。复制、解密、转码和缩略图只写 staging 或不可变 bundle。ChatFiles 只能清理自己的生成缓存，不能把微信原始缓存纳入 LRU。

统一文件服务通过 `/api/v1/files/:scope/:id/*` 暴露能力：

- `archive`：已归档副本。
- `source`：manifest 明确列出的源文件。
- `artifact`：证据和物化状态允许的聊天资产。

URL 只使用稳定 ID，不接受绝对路径。文本、数据库、压缩包、语音和二进制检查都由 capability policy 决定；超限只禁预览，不修改原文件。

## 发布

library/assets 先写 staging，生成 product manifest、receipt 和依赖指纹，再 seal 为不可变产品。激活由 catalog 事务统一完成，不能直接覆盖 current 目录或 JSON 文件。
