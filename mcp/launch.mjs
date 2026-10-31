// MCP 服务器入口：按插件配置 mcpServer（从 Open Design 设置里复制的片段）启动 Open Design 自己的 od mcp（stdio），
// 标准输入输出直接交给它。Open Design 的命令在每台机器上不同（桌面版里运行时与 od.mjs 的绝对路径），所以不能写死在清单里。
//
// 平台把生效的配置放在环境变量 LOOP_NOW_PLUGIN_OPEN_DESIGN_CONFIG（JSON），Pi 启动 MCP 服务器时继承它。
// 交给 Open Design 的环境去掉所有 LOOP_NOW_ 开头的变量（含 Agent 的平台令牌），它用不到。
//
// Pi 的提示只说服务器连不上，不带这里的说明，所以另有检查用法：node launch.mjs --check [文件]，
// 从文件（缺省为标准输入）读粘贴的片段，只检查、不启动，打印与这里相同的说明。

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

import { parseSnippet, WHERE } from './snippet.mjs'

const CONFIG_ENV = 'LOOP_NOW_PLUGIN_OPEN_DESIGN_CONFIG'

function fail(message) {
  process.stderr.write(`[open-design] ${message}\n`)
  process.exit(1)
}

const missing = (command) => `找不到 ${command}：Open Design 可能更新、换了位置或已卸载。${WHERE}`

if (process.argv[2] === '--check') {
  let spec
  try {
    spec = parseSnippet(readFileSync(process.argv[3] ?? 0, 'utf8'))
  } catch (err) {
    fail(err.message)
  }
  if (!existsSync(spec.command)) fail(missing(spec.command))
  process.stdout.write(`[open-design] 可以使用：${[spec.command, ...spec.args].map((a) => JSON.stringify(a)).join(' ')}\n`)
  process.exit(0)
}

let config = {}
try {
  config = JSON.parse(process.env[CONFIG_ENV] ?? '{}') ?? {}
} catch {
  fail(`${CONFIG_ENV} 不是合法的 JSON`)
}

let spec
try {
  spec = parseSnippet(config.mcpServer)
} catch (err) {
  fail(err.message)
}
if (!existsSync(spec.command)) fail(missing(spec.command))

const env = {}
for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('LOOP_NOW_')) env[k] = v
Object.assign(env, spec.env)

const child = spawn(spec.command, spec.args, { stdio: 'inherit', env })
child.on('error', (err) => fail(`启动 ${spec.command} 失败：${err.message}`))
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => child.kill(signal))
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
