// 读插件配置 mcpServer：从 Open Design 设置里复制的 MCP 片段，得到启动 Open Design 的 od mcp 所用的 command、args 与 env。
// 接受 Cursor／Kiro CLI 那一页的 JSON（{"mcpServers": {"open-design": {...}}}）、Claude Code 那一页的
// claude mcp add-json 命令（取其中的 JSON），以及只有 {command, args, env} 的条目。

import path from 'node:path'

export const WHERE = '在 Open Design 桌面版的 Settings › OpenDesign MCP 里选 Cursor 或 Kiro CLI，复制它给出的 JSON，粘贴到 Loop Now 里本插件配置的 mcpServer'

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

/** 片段里的条目：有 mcpServers 时取其中的 open-design（只有一项时取那一项），否则是条目本身，或只包着一个条目的对象。 */
function entryOf(obj) {
  if (isObject(obj.mcpServers)) {
    const servers = obj.mcpServers
    if (isObject(servers['open-design'])) return servers['open-design']
    const values = Object.values(servers)
    if (values.length === 1 && isObject(values[0])) return values[0]
    throw new Error(`mcpServers 里没有 open-design 条目：${WHERE}`)
  }
  if ('command' in obj) return obj
  const values = Object.values(obj)
  if (values.length === 1 && isObject(values[0]) && 'command' in values[0]) return values[0]
  throw new Error(`mcpServer 里找不到 command：${WHERE}`)
}

/** 解析粘贴的片段；不合格时抛出给人看的说明。 */
export function parseSnippet(text) {
  if (typeof text !== 'string' || text.trim() === '') throw new Error(`还没有设置 mcpServer：${WHERE}`)
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error(`mcpServer 里没有 JSON（Codex 那一页的 TOML 不能用）：${WHERE}`)
  let obj
  try {
    obj = JSON.parse(text.slice(start, end + 1))
  } catch (err) {
    throw new Error(`mcpServer 不是合法的 JSON（${err.message}）：${WHERE}`)
  }
  if (!isObject(obj)) throw new Error(`mcpServer 须是 JSON 对象：${WHERE}`)
  const entry = entryOf(obj)
  const { command, args = [], env = {} } = entry
  if (typeof command !== 'string' || command === '') throw new Error(`mcpServer 的 command 须是非空字符串：${WHERE}`)
  if (!path.isAbsolute(command)) {
    throw new Error(
      `mcpServer 的 command 须是绝对路径，现在是 ${JSON.stringify(command)}：macOS 自带的 /usr/bin/od 会遮住 Open Design 的 od 命令。请复制 Open Design 设置里给出的片段，它用的是绝对路径`,
    )
  }
  if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) throw new Error('mcpServer 的 args 须是字符串数组')
  if (!isObject(env) || !Object.values(env).every((v) => typeof v === 'string')) throw new Error('mcpServer 的 env 须是值为字符串的对象')
  return { command, args, env }
}
