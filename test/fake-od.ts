// 假的 Open Design MCP 服务器（stdio，每行一条 JSON-RPC），代替 `<运行时> <od.mjs> mcp`：
// 工具名与 Open Design 0.26.1 的 od mcp 相同，调用只回一行 "fake <工具> <参数>"；资源有一个设计系统的 DESIGN.md。
// FAKE_OD_LOG 设置时，启动与每次调用各追加一行 JSON：启动时记下 argv、OD_DATA_DIR 和看得到的 LOOP_NOW_ 变量名。
// FAKE_OD_EXIT_AFTER_CALLS=n 时回完第 n 次调用就退出（模拟 od mcp 空闲退出或 Open Design 被关掉）。
import { appendFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

export const TOOLS = [
  'collect_brief',
  'confirm_brief',
  'list_projects',
  'get_active_context',
  'get_artifact',
  'get_project',
  'get_file',
  'search_files',
  'list_files',
  'create_artifact',
  'write_file',
  'delete_file',
  'delete_project',
  'create_project',
  'list_skills',
  'list_plugins',
  'start_vela_login',
  'get_vela_login_status',
  'start_run',
  'get_run',
  'cancel_run',
  'list_agents',
]

export const DESIGN_MD = 'od://design-systems/linear/DESIGN.md'

if (import.meta.main) {
  const log = (entry: unknown) => {
    if (process.env.FAKE_OD_LOG) appendFileSync(process.env.FAKE_OD_LOG, `${JSON.stringify(entry)}\n`)
  }
  log({
    event: 'start',
    argv: process.argv.slice(2),
    dataDir: process.env.OD_DATA_DIR ?? null,
    loopNow: Object.keys(process.env).filter((k) => k.startsWith('LOOP_NOW_')),
  })
  const exitAfter = Number(process.env.FAKE_OD_EXIT_AFTER_CALLS ?? 0)
  let calls = 0
  const reply = (id: unknown, result: unknown) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
  const error = (id: unknown, code: number, message: string) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`)

  createInterface({ input: process.stdin }).on('line', (line) => {
    let m: { id?: unknown; method?: string; params?: Record<string, unknown> }
    try {
      m = JSON.parse(line)
    } catch {
      return
    }
    if (m.id === undefined) return // 通知
    switch (m.method) {
      case 'initialize':
        return reply(m.id, {
          protocolVersion: m.params?.protocolVersion ?? '2025-06-18',
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: 'open-design', version: '0.2.0' },
        })
      case 'ping':
        return reply(m.id, {})
      case 'tools/list':
        return reply(m.id, { tools: TOOLS.map((name) => ({ name, description: `fake ${name}`, inputSchema: { type: 'object', properties: {}, additionalProperties: true } })) })
      case 'resources/list':
        return reply(m.id, { resources: [{ uri: DESIGN_MD, name: 'Linear', mimeType: 'text/markdown' }] })
      case 'resources/read':
        if (m.params?.uri !== DESIGN_MD) return error(m.id, -32602, `unknown resource ${String(m.params?.uri)}`)
        return reply(m.id, { contents: [{ uri: DESIGN_MD, mimeType: 'text/markdown', text: '# Linear\nfake design system' }] })
      case 'tools/call': {
        const name = String(m.params?.name)
        const args = m.params?.arguments ?? {}
        log({ event: 'call', name, arguments: args })
        reply(m.id, { content: [{ type: 'text', text: `fake ${name} ${JSON.stringify(args)}` }] })
        if (exitAfter > 0 && ++calls >= exitAfter) setImmediate(() => process.exit(0))
        return
      }
      default:
        return error(m.id, -32601, `method not found: ${m.method}`)
    }
  })
}
