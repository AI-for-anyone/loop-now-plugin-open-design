// 清单与 Skill 的约定；启动配置的解析与启动器；按平台的写法生成 mcp.json，在真实的 Pi（RPC 模式、Loop Now 的启动参数）里
// 经启动器加载假的 Open Design MCP 服务器（fake-od.ts），用进程内的离线模型（fixtures/offline-provider.ts）发出工具调用。
// 没有可用的 Pi 时跳过真实 Pi 的部分（LOOP_NOW_TEST_PI_ROOT 指定 Pi 包目录）。

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { setTimeout as sleep } from 'node:timers/promises'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { parseSnippet } from '../mcp/snippet.mjs'
import { DESIGN_MD, TOOLS } from './fake-od.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const skillsDir = path.join(root, 'skills')
const skillFile = path.join(skillsDir, 'open-design/SKILL.md')
const launcher = path.join(root, 'mcp/launch.mjs')
const fakeOd = fileURLToPath(new URL('./fake-od.ts', import.meta.url))
const provider = fileURLToPath(new URL('./fixtures/offline-provider.ts', import.meta.url))
const piRoot = process.env.LOOP_NOW_TEST_PI_ROOT || '/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent'
const piCli = path.join(piRoot, 'dist/bundle/cli.js')
const noPi = !existsSync(piCli) && `找不到 ${piCli}`

/** 平台合并后的服务器名：插件 id + "-" + 清单里的名字；Pi 的工具名把 - 换成 _。 */
const SERVER = 'open-design-desktop'
const PREFIX = 'mcp__open_design_desktop__'
const CONFIG_ENV = 'LOOP_NOW_PLUGIN_OPEN_DESIGN_CONFIG'

const scratch = mkdtempSync(path.join(tmpdir(), 'loop-now-open-design-'))
after(() => rmSync(scratch, { recursive: true, force: true }))

/** Open Design 设置里 Cursor／Kiro CLI 那一页给出的 JSON，命令换成假服务器。 */
function cursorSnippet(env: Record<string, string> = {}): string {
  const inner = { command: process.execPath, args: [fakeOd, 'mcp', '--daemon-url', 'http://127.0.0.1:1'], env: { OD_DATA_DIR: path.join(scratch, 'od-data'), ...env } }
  return JSON.stringify({ mcpServers: { 'open-design': inner } }, null, 2)
}

/**
 * 与服务端 AgentAssets 合并写入 Agent 的 Pi 目录 mcp.json 相同：键为 <插件 id>-<名字>；
 * args 里以 ./ 开头的路径按安装目录解析，command 不是相对路径，原样保留。
 */
function mcpJson(): { mcpServers: Record<string, unknown> } {
  const servers: Record<string, unknown> = {}
  for (const [name, entry] of Object.entries(pkg.loopNow.mcpServers as Record<string, { args: string[] }>)) {
    servers[`${pkg.loopNow.id}-${name}`] = { ...entry, args: entry.args.map((a) => (a.startsWith('./') ? path.join(root, a) : a)) }
  }
  return { mcpServers: servers }
}

type Rec = { type?: string; id?: string; method?: string; message?: string; data?: { messages: Message[] } }
type Message = { role: string; toolName?: string; isError?: boolean; content: { type: string; text?: string }[] }
type Turn = { turn: number; systemPrompt?: string; tools: string[] }
type LogEntry = { event: 'start'; argv: string[]; dataDir: string | null; loopNow: string[] } | { event: 'call'; name: string; arguments: Record<string, unknown> }

const readLog = (file: string): LogEntry[] => (existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as LogEntry) : [])

/** 一个 Pi 进程：参数照 Loop Now 的 piArgs 与 pluginArgs（--no-skills --no-extensions，插件的 --skill 与 -e builtin:mcp）；env 带平台注入的插件配置。 */
async function startPi(o: { config: Record<string, unknown> | null; calls: ({ name: string; arguments: Record<string, unknown> } | null)[] }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'loop-now-open-design-pi-'))
  const agentDir = path.join(dir, 'pi')
  mkdirSync(agentDir)
  writeFileSync(path.join(agentDir, 'mcp.json'), JSON.stringify(mcpJson(), null, 2))
  const report = path.join(dir, 'report.jsonl')
  const flags = ['--mode', 'rpc', '--no-approve', '--offline', '--no-skills', '--no-extensions', '--no-prompt-templates', '--no-themes']
  flags.push('--skill', skillsDir, '-e', 'builtin:mcp', '-e', provider, '--provider', 'test-offline', '--model', 'fixture', '--session-dir', path.join(dir, 'sessions'))
  const env: Record<string, string> = {
    HOME: dir,
    PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
    PI_CODING_AGENT_DIR: agentDir,
    PI_OFFLINE: '1',
    PI_TELEMETRY: '0',
    PI_TEST_TOOL_CALLS: JSON.stringify(o.calls),
    PI_TEST_REPORT: report,
    LOOP_NOW_AGENT_TOKEN: 'agent-token-for-test',
  }
  if (o.config) env[CONFIG_ENV] = JSON.stringify(o.config)
  const child = spawn(process.execPath, [piCli, ...flags], { cwd: dir, env, stdio: ['pipe', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (d) => (stderr += d))
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  const records: Rec[] = []
  const waiters: { pred: (r: Rec) => boolean; resolve: (r: Rec) => void }[] = []
  createInterface({ input: child.stdout }).on('line', (line) => {
    let r: Rec
    try {
      r = JSON.parse(line)
    } catch {
      return
    }
    records.push(r)
    for (const w of [...waiters]) if (w.pred(r)) waiters.splice(waiters.indexOf(w), 1) && w.resolve(r)
  })
  const waitFor = (pred: (r: Rec) => boolean) =>
    Promise.race([
      new Promise<Rec>((resolve) => waiters.push({ pred, resolve })),
      exited.then(() => Promise.reject(new Error(`Pi 提前退出：${stderr.slice(0, 1500)}`))),
    ])
  const send = (m: unknown) => child.stdin.write(`${JSON.stringify(m)}\n`)
  let n = 0
  return {
    records,
    async prompt(): Promise<void> {
      const ended = waitFor((r) => r.type === 'agent_end')
      send({ id: `p${++n}`, type: 'prompt', message: 'go' })
      await ended
    },
    async messages(): Promise<Message[]> {
      const reply = waitFor((r) => r.id === 'm')
      send({ id: 'm', type: 'get_messages' })
      return (await reply).data!.messages
    },
    turns(): Turn[] {
      return existsSync(report) ? readFileSync(report, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Turn) : []
    },
    async close(): Promise<void> {
      child.kill('SIGTERM')
      await exited
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

const results = (messages: Message[]) => messages.filter((m) => m.role === 'toolResult')
const text = (m: Message) => m.content.map((c) => c.text ?? '').join('\n')

/** 直接运行启动器，发 initialize，返回第一行回复（或退出码与标准错误）。 */
async function runLauncher(env: Record<string, string>): Promise<{ code: number | null; stderr: string; reply: unknown }> {
  const child = spawn(process.execPath, [launcher], { env: { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, ...env }, stdio: ['pipe', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (d) => (stderr += d))
  const exited = new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)))
  const first = new Promise<unknown>((resolve) => createInterface({ input: child.stdout }).once('line', (line) => resolve(JSON.parse(line))))
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } })}\n`)
  const reply = await Promise.race([first, exited.then(() => null)])
  child.stdin.end()
  const code = await exited
  return { code, stderr, reply }
}

describe('清单与 Skill', () => {
  it('只有 Agent 侧：一个 Skill 目录和经启动器的 Open Design MCP 服务器，一个配置项，没有平台侧与权限', () => {
    const ln = pkg.loopNow
    assert.equal(ln.id, 'open-design')
    assert.equal(pkg.version, '0.1.2')
    for (const key of ['platform', 'permissions', 'events', 'accounts', 'bin', 'channels']) assert.equal(ln[key], undefined, key)
    assert.deepEqual(pkg.pi, { skills: ['./skills'] })
    assert.deepEqual(Object.keys(ln.mcpServers), ['desktop'])
    const entry = ln.mcpServers.desktop
    assert.equal(entry.command, 'node')
    assert.deepEqual(entry.args, ['./mcp/launch.mjs'])
    assert.equal(entry.url, undefined)
    assert.equal(entry.exposure, 'direct')
    assert.match(entry.description, /Open Design 桌面版/)
    assert.equal(JSON.stringify(entry).includes('${'), false, '没有占位符')
    assert.deepEqual(Object.keys(ln.configSchema.properties), ['mcpServer'])
    const field = ln.configSchema.properties.mcpServer
    assert.equal(field.type, 'string')
    assert.equal(field['x-secret'], undefined, '不能是 secret：secret 字段不进 Pi 的环境变量')
    assert.equal(field['x-scope'], undefined, 'Open Design 装在机器上，不按项目')
    assert.match(field.description, /Settings › OpenDesign MCP/)
    assert.match(field.description, /\/usr\/bin\/od/)
    assert.match(field.description, /绝对路径/)
    assert.equal(pkg.dependencies, undefined, '没有运行依赖')
  })

  it('SKILL.md 的 frontmatter 合 Agent Skills 规范，写明工具前缀、默认走 start_run、何时停下来转告用户', () => {
    const raw = readFileSync(skillFile, 'utf8')
    const m = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(raw)
    assert.ok(m, 'frontmatter 只有 name 与 description')
    assert.equal(m![1], 'open-design')
    assert.ok(m![2]!.length <= 1024)
    assert.match(m![2]!, new RegExp(PREFIX))
    for (const tool of ['create_project', 'list_agents', 'start_run', 'get_run', 'cancel_run', 'get_artifact', 'create_artifact', 'write_file', 'collect_brief']) assert.match(raw, new RegExp(`\`${tool}\``), tool)
    assert.match(raw, /requestId/)
    assert.match(raw, /30 到 60 秒/)
    assert.match(raw, /5 到 30 分钟/)
    assert.match(raw, /previewUrl/)
    assert.match(raw, /明确要求/)
    assert.match(raw, /跳过了 Open Design 的 Skill 流水线/)
    assert.match(raw, /原样转给用户/)
    assert.match(raw, /\.pptx/)
    assert.match(raw, new RegExp(`server\`? 填 \`${SERVER}\``))
  })
})

describe('启动配置', () => {
  const entry = { command: '/Applications/Open Design.app/Contents/MacOS/Open Design', args: ['/Applications/Open Design.app/Contents/Resources/od.mjs', 'mcp'], env: { OD_DATA_DIR: '/x', ELECTRON_RUN_AS_NODE: '1' } }

  it('接受 Cursor／Kiro CLI 的 JSON、Claude Code 的 add-json 命令和单独的条目', () => {
    const cursor = JSON.stringify({ mcpServers: { 'open-design': entry } }, null, 2)
    assert.deepEqual(parseSnippet(cursor), entry)
    assert.deepEqual(parseSnippet(`claude mcp add-json --scope user open-design '${JSON.stringify(entry)}'`), entry)
    assert.deepEqual(parseSnippet(JSON.stringify(entry)), entry)
    assert.deepEqual(parseSnippet(JSON.stringify({ 'open-design': entry })), entry)
    assert.deepEqual(parseSnippet(JSON.stringify({ mcpServers: { other: entry } })), entry, '只有一项时用那一项')
    assert.deepEqual(parseSnippet(JSON.stringify({ command: entry.command })), { command: entry.command, args: [], env: {} })
  })

  it('不合格时说明怎么做', () => {
    const bad: [unknown, RegExp][] = [
      [undefined, /还没有设置 mcpServer：在 Open Design 桌面版的 Settings › OpenDesign MCP 里选 Cursor 或 Kiro CLI/],
      ['  ', /还没有设置 mcpServer/],
      ['[mcp_servers.open-design]\ncommand = "/x"\nargs = ["/y", "mcp"]', /没有 JSON（Codex 那一页的 TOML 不能用）/],
      ['{"mcpServers": {', /没有 JSON|不是合法的 JSON/],
      ['{"mcpServers": {"a": {"command": "/x"}, "b": {"command": "/y"}}}', /mcpServers 里没有 open-design 条目/],
      ['{"name": "open-design"}', /找不到 command/],
      ['{"command": "od", "args": ["mcp"]}', /command 须是绝对路径，现在是 "od"：macOS 自带的 \/usr\/bin\/od 会遮住 Open Design 的 od 命令/],
      ['{"command": "./od", "args": ["mcp"]}', /须是绝对路径/],
      ['{"command": "/x", "args": "mcp"}', /args 须是字符串数组/],
      ['{"command": "/x", "env": {"A": 1}}', /env 须是值为字符串的对象/],
    ]
    for (const [value, message] of bad) assert.throws(() => parseSnippet(value), message, String(value))
  })

  it('启动器按片段启动 Open Design 的 MCP 服务器，用片段的 env，不交出 LOOP_NOW_ 开头的变量', async () => {
    const log = path.join(scratch, 'launcher.jsonl')
    const r = await runLauncher({ [CONFIG_ENV]: JSON.stringify({ mcpServer: cursorSnippet({ FAKE_OD_LOG: log }) }), LOOP_NOW_AGENT_TOKEN: 'secret' })
    assert.equal(r.code, 0, r.stderr)
    assert.equal((r.reply as { result: { serverInfo: { name: string } } }).result.serverInfo.name, 'open-design')
    assert.deepEqual(readLog(log), [{ event: 'start', argv: ['mcp', '--daemon-url', 'http://127.0.0.1:1'], dataDir: path.join(scratch, 'od-data'), loopNow: [] }])
  })

  it('没有配置、配置不对或 Open Design 不在了：退出并在标准错误里说明', async () => {
    const cases: [Record<string, string>, RegExp][] = [
      [{}, /^\[open-design\] 还没有设置 mcpServer：在 Open Design 桌面版的 Settings › OpenDesign MCP 里/],
      [{ [CONFIG_ENV]: '{' }, /^\[open-design\] LOOP_NOW_PLUGIN_OPEN_DESIGN_CONFIG 不是合法的 JSON/],
      [{ [CONFIG_ENV]: JSON.stringify({ mcpServer: '{"command": "od"}' }) }, /^\[open-design\] mcpServer 的 command 须是绝对路径/],
      [{ [CONFIG_ENV]: JSON.stringify({ mcpServer: '{"command": "/nonexistent/Open Design"}' }) }, /^\[open-design\] 找不到 \/nonexistent\/Open Design：Open Design 可能更新、换了位置或已卸载/],
    ]
    for (const [env, message] of cases) {
      const r = await runLauncher(env)
      assert.equal(r.code, 1)
      assert.equal(r.reply, null)
      assert.match(r.stderr, message)
    }
  })

  it('--check：只检查粘贴的片段（文件或标准输入），打印同样的说明，不启动', async () => {
    const check = (args: string[], input?: string) =>
      new Promise<{ code: number | null; out: string }>((resolve) => {
        const child = spawn(process.execPath, [launcher, '--check', ...args], { stdio: ['pipe', 'pipe', 'pipe'] })
        let out = ''
        child.stdout.on('data', (d) => (out += d))
        child.stderr.on('data', (d) => (out += d))
        child.once('exit', (code) => resolve({ code, out }))
        child.stdin.end(input ?? '')
      })
    const file = path.join(scratch, 'snippet.json')
    writeFileSync(file, cursorSnippet())
    const ok = await check([file])
    assert.equal(ok.code, 0)
    assert.equal(ok.out, `[open-design] 可以使用：${JSON.stringify(process.execPath)} ${JSON.stringify(fakeOd)} "mcp" "--daemon-url" "http://127.0.0.1:1"\n`)
    assert.equal((await check([], cursorSnippet())).code, 0, '没有文件时读标准输入')
    const bad = await check([], '{"command": "od"}')
    assert.equal(bad.code, 1)
    assert.match(bad.out, /^\[open-design\] mcpServer 的 command 须是绝对路径/)
    const gone = await check([], '{"command": "/nonexistent/Open Design"}')
    assert.match(gone.out, /^\[open-design\] 找不到 \/nonexistent\/Open Design/)
  })
})

describe('在真实的 Pi 里', { skip: noPi }, () => {
  it('Skill 列进系统提示；工具以 mcp__open_design_desktop__ 直接出现，调用与资源读取经启动器到达 Open Design', { timeout: 60_000 }, async () => {
    const log = path.join(scratch, 'pi-ok.jsonl')
    const pi = await startPi({
      config: { mcpServer: cursorSnippet({ FAKE_OD_LOG: log }) },
      calls: [
        { name: `${PREFIX}list_agents`, arguments: {} },
        { name: `${PREFIX}start_run`, arguments: { project: 'launch-page', prompt: 'A landing page', requestId: '0b0e7f3c-8e7e-4a43-9a1d-2f1f6f0c9d11' } },
        { name: 'read_mcp_resource', arguments: { server: SERVER, uri: DESIGN_MD } },
      ],
    })
    try {
      await pi.prompt()
      const first = pi.turns()[0]!
      for (const t of TOOLS) assert.ok(first.tools.includes(`${PREFIX}${t}`), `${t} 不在 ${first.tools.join(', ')}`)
      assert.ok(first.tools.includes('read_mcp_resource'))
      assert.ok((first.systemPrompt ?? '').includes(skillFile), '系统提示里有 SKILL.md 的位置')
      assert.ok((first.systemPrompt ?? '').includes('通过 Open Design 生成或修改设计'), '系统提示里有 Skill 的说明')

      const r = results(await pi.messages())
      assert.deepEqual(
        r.map((m) => [m.toolName, m.isError ?? false]),
        [
          [`${PREFIX}list_agents`, false],
          [`${PREFIX}start_run`, false],
          ['read_mcp_resource', false],
        ],
      )
      assert.equal(text(r[0]!), 'fake list_agents {}')
      assert.match(text(r[2]!), /fake design system/)
      const entries = readLog(log)
      assert.deepEqual(entries[0], { event: 'start', argv: ['mcp', '--daemon-url', 'http://127.0.0.1:1'], dataDir: path.join(scratch, 'od-data'), loopNow: [] })
      assert.deepEqual(
        entries.slice(1),
        [
          { event: 'call', name: 'list_agents', arguments: {} },
          { event: 'call', name: 'start_run', arguments: { project: 'launch-page', prompt: 'A landing page', requestId: '0b0e7f3c-8e7e-4a43-9a1d-2f1f6f0c9d11' } },
        ],
      )
    } finally {
      await pi.close()
    }
  })

  it('没有粘贴配置：没有 Open Design 工具，Pi 报一次 MCP 服务器要处理；Skill 仍在', { timeout: 60_000 }, async () => {
    const pi = await startPi({ config: null, calls: [] })
    try {
      await pi.prompt()
      assert.equal(pi.turns()[0]!.tools.some((t) => t.startsWith(PREFIX)), false)
      assert.ok((pi.turns()[0]!.systemPrompt ?? '').includes(skillFile), 'Skill 仍在，Agent 能照它告诉用户怎么做')
      const notices = pi.records.filter((r) => r.type === 'extension_ui_request' && r.method === 'notify' && r.message?.includes(SERVER))
      assert.equal(notices.length, 1, JSON.stringify(pi.records.filter((r) => r.type === 'extension_ui_request')))
      assert.match(notices[0]!.message!, /MCP servers need attention/)
    } finally {
      await pi.close()
    }
  })

  it('Open Design 的 MCP 服务器中途退出（空闲退出或 Open Design 关了）：下一次调用重新启动它', { timeout: 60_000 }, async () => {
    const log = path.join(scratch, 'pi-exit.jsonl')
    const call = { name: `${PREFIX}list_projects`, arguments: {} }
    const pi = await startPi({ config: { mcpServer: cursorSnippet({ FAKE_OD_LOG: log, FAKE_OD_EXIT_AFTER_CALLS: '1' }) }, calls: [call, null, call, null] })
    try {
      await pi.prompt()
      // 真实的空闲退出发生在 30 分钟没有调用之后，Pi 早已看到连接关闭；这里等它看到再调。
      await sleep(500)
      await pi.prompt()
      const r = results(await pi.messages())
      assert.deepEqual(r.map((m) => [m.isError ?? false, text(m)]), [
        [false, 'fake list_projects {}'],
        [false, 'fake list_projects {}'],
      ])
      assert.deepEqual(readLog(log).map((e) => e.event), ['start', 'call', 'start', 'call'])
    } finally {
      await pi.close()
    }
  })
})
