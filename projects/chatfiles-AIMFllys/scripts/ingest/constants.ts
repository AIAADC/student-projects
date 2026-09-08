export const maxCandidateBytes = 50 * 1024 * 1024

export const signalRules: Array<[string, RegExp]> = [
  ['AI/技术', /ai|llm|prompt|模型|代码|算法|开发|架构|接口|数据|python|typescript|react|openai|claude|数据库|工程|部署|调试/i],
  ['哲理/方法', /哲学|意义|价值|原则|方法|思考|复盘|成长|判断|选择|长期|系统|认知|心态/i],
  ['学业', /课程|考试|复习|基医|强基|医学|学分|作业|实验|高数|化学|英语|解剖|生物|病理/i],
  ['创业/项目', /创业|商业|产品|用户|市场|融资|项目|计划|需求|运营|商业模式|增长/i],
  ['比赛', /比赛|竞赛|挑战杯|大创|建模|赛题|路演/i],
  ['生活/关系', /朋友|关系|沟通|家庭|生活|情绪|压力|喜欢|老师|同学/i],
]

export const candidateName =
  /微信|wechat|qq|聊天|(^|[^a-z])chat([^a-z]|$)|message|messages|msg|消息|群聊|好友|conversation|dialog/i
export const candidateExt = /\.(txt|md|csv|json|html?)$/i
export const excludePath =
  /\\(node_modules|\.git|dist|archive|data|Documents\\Codex|Emoji|Cache|CacheStorage|Service Worker|Local Storage|Session Storage|logs?|xplugin|XPlugin|publicLib|diagnosticMessages\.generated\.json)\\/i
