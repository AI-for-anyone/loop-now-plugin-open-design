# Loop Now Open Design 插件

[English](https://github.com/AI-for-anyone/loop-now-plugin-open-design/blob/main/README.md)

一个 [Loop Now](https://github.com/AI-for-anyone/loop-now) 插件：让 Agent 通过 **Open Design 桌面版的 MCP 服务器** 使用 [Open Design](https://open-design.ai)。Agent 可以让 Open Design 生成和修改网页、产品原型、落地页、演示稿、图片和动效，也可以读取设计的文件、把它们复制进 Loop Now 的文件夹，以及读取 Open Design 的设计系统。

它只有 Agent 侧：一个 Skill、一条 MCP 服务器声明，以及一个用来粘贴 Open Design MCP 配置的配置项。Skill 告诉 Agent 怎么委托 Open Design 做设计、要等多久、什么时候停下来问你。插件在 Loop Now 里不需要任何权限或账号。

## 开始之前

- **Open Design 用它自己的运行时生成，不用 Loop Now 里的模型。** 设计由 Open Design 那边配置的运行时完成：那台机器上的命令行编码 Agent（Claude Code、Codex、Cursor、OpenCode、Pi 等），或 OpenDesign Cloud。你在 Loop Now 里给 Pi 配的模型账号不会被用到，运行时要单独配置、单独计费。最省事的是 Claude Code：那台机器上装好并登录了，Open Design 就能在 PATH 上找到它。
- **Agent 使用时 Open Design 必须在运行**，所以请开着桌面版。它没开时，Open Design 的 MCP 服务器会尝试在后台、不带窗口地启动 Open Design，最多等一分钟；之后即使 Agent 用完了，它也继续在后台运行。
- **一次运行要 5 到 30 分钟。** Agent 每隔 30 到 60 秒查一次进度，做完告诉你。
- **Open Design 默认分享使用数据和对话内容。** 第一次启动时会让你选 **分享**（Share）或 **不分享**（Don't share）。选“分享”会同时打开两项：**匿名指标**（Anonymous metrics：运行次数、token 用量、错误率、耗时）和 **对话和工具内容**（Conversation and tool content）。后者把提示词、回复和工具的输入输出截断、去掉密钥等敏感信息后发给 Open Design 团队，存在 Langfuse（一个记录大模型调用的云服务）里；生成的文件本身不发送。通过本插件发出的设计需求也在其中。用真实项目的内容之前，建议在 **设置 › 隐私**（Settings › Privacy）里关闭 **对话和工具内容**。官方版本另外总会发送脱敏的崩溃与可靠性报告。详见 Open Design 的[隐私说明](https://github.com/nexu-io/open-design/blob/main/PRIVACY.md)。
- **Open Design 不通过 MCP 产出 .pptx 或 .pdf 文件。** 演示稿是 HTML 版；要 PPTX 或 PDF，由你在 Open Design 里导出。

## 需要

- 2026 年 10 月 30 日及以后的 Loop Now 版本。
- Loop Now 所在的机器上装着 Open Design 桌面版：macOS（Apple 芯片或 Intel）或 Windows（x64）。Open Design 没有现成的 Linux 版本，从源码运行不在本文范围内。
- Open Design 能用的运行时，见上。

## 1. 准备 Open Design

1. 从 [open-design.ai](https://open-design.ai) 或 [GitHub Releases](https://github.com/nexu-io/open-design/releases) 下载并安装桌面版。
2. 第一次启动时，在隐私提示里选 **分享**（Share）或 **不分享**（Don't share），见“开始之前”里关于隐私的一条。以后可以在 **设置 › 隐私**（Settings › Privacy）里改。
3. 选运行时：**Settings › Models & providers**。**Local CLI** 下列出 Open Design 在 PATH 上找到的命令行编码 Agent；没找到你的，确认它所在的目录在 Open Design 的 PATH 里，再点 **Rescan**。也可以登录 OpenDesign Cloud。
4. 在 Open Design 里先做一个小设计，确认运行时能用。

## 2. 复制 Open Design 的 MCP 配置

在 Open Design 里打开 **Settings › OpenDesign MCP**，选 **Cursor** 或 **Kiro CLI**，复制它给出的 JSON，以 `{"mcpServers"` 开头。**Claude Code** 那一页的 `claude mcp add-json …` 命令也可以，整行复制。**Codex** 那一页是 TOML，这里用不了。

这段配置里是指向 Open Design 应用内部的绝对路径。不要把命令简写成 `od`：macOS 自带的 `/usr/bin/od` 是一个系统工具，会遮住 Open Design 的 `od`。Open Design 更新或换了位置后，重新复制一次。

## 3. 在 Loop Now 里安装

控制台：**插件市场** › **安装插件**，来源选 **git 仓库**，**仓库地址** 填 `https://github.com/AI-for-anyone/loop-now-plugin-open-design.git`。或者用命令行：

```sh
loopctl plugin install https://github.com/AI-for-anyone/loop-now-plugin-open-design.git@main --force
```

`--force` 确认安装非官方来源。插件没有依赖，安装时什么也不下载。

## 4. 粘贴配置

**插件市场** › **Open Design** › **详情** › **配置**：把复制的内容粘贴到唯一的配置项 `mcpServer`（表单上显示为 **Open Design 的 MCP 配置**），保存。这个配置对所有项目生效。

## 5. 启用并授权给 Agent

1. **项目设置** › **插件** › **管理项目插件**：启用 **Open Design**。
2. 需要用它的 Agent，在其配置的 **插件权限** 一栏授权 **Open Design** 并保存。

工具名以 `mcp__open_design_desktop__` 开头，在该 Agent 下次启动 Pi 时生效。平台在 Agent 空闲一段时间后（默认 10 分钟）回收它的 Pi，之后的第一条消息会重新启动。

## 验证

开着 Open Design，问 Agent：“Open Design 能用哪些运行时？”它会调用 `mcp__open_design_desktop__list_agents` 并列出来。Agent 说没有 Open Design 的工具时，看“常见问题”。

## 使用

- **要一份设计**，例如：“用 Open Design 给我们的笔记应用做一个落地页，用 Linear 的设计系统。”缺的信息 Agent 会在对话里问你（Loop Now 不显示 Open Design 的问卷卡片），然后建一个 Open Design 项目、发起一次运行，一直查到做完。你会拿到项目名和预览链接。链接是 Loop Now 那台机器上的 `127.0.0.1` 地址，在那台机器的浏览器里打开，或在 Open Design 里打开这个项目。
- **改一份设计**：“把首屏改暗一点，标题再短一些。”Agent 在同一个项目上发起新的运行。
- **拿文件**：“把这份设计的文件复制到项目文件夹。”Agent 取回入口文件和它引用的所有文件，写到你说的位置。
- **演示稿和文档**：Open Design 做的是在浏览器里看的 HTML 演示稿。要 .pptx 或 .pdf，在 Open Design 里导出。
- **用 Agent 自己的模型**：只有你明确要求时，Agent 才不用 Open Design 的运行时、自己写设计。这样会跳过 Open Design 的 Skill 流水线，Open Design 不推荐。
- 除非你要求并说清删哪个，Agent 不会删除 Open Design 的项目或文件。

## 工具

| 工具 | 用途 |
|---|---|
| `create_project`、`list_projects`、`get_project` | 新建要生成到其中的项目；找项目；项目信息与预览链接 |
| `start_run`、`get_run`、`cancel_run` | 让 Open Design 生成或修改设计；查进度；停止 |
| `list_agents`、`list_skills`、`list_plugins` | Open Design 能用的运行时、Skill 和工作流 |
| `get_artifact`、`get_file`、`search_files`、`list_files` | 读取设计的文件 |
| `create_artifact`、`write_file`、`delete_file`、`delete_project` | 写入或删除文件和项目（只在你要求时使用） |
| `get_active_context` | 你此刻在 Open Design 里打开的项目 |
| `start_vela_login`、`get_vela_login_status` | 登录 OpenDesign Cloud |
| `collect_brief`、`confirm_brief` | Open Design 的问卷卡片；Loop Now 显示不了，所以不用 |

Open Design 的设计系统和 Skill 还以 MCP 资源提供（`od://design-systems/<id>/DESIGN.md`、`od://skills/<id>/SKILL.md`），Agent 用 Pi 的 `read_mcp_resource` 读取。实际的工具与参数以所装的 Open Design 提供的为准。

## 常见问题

- **Agent 没有 Open Design 的工具**，对话里可能还有一条 `open-design-desktop` 失败的提示：插件没能启动 Open Design 的 MCP 服务器，通常是 `mcpServer` 为空、粘贴的不是那段 JSON，或 Open Design 更新、换了位置后配置过时了。想知道具体原因，把粘贴的内容存成文件，在 Loop Now 那台机器上检查：

  ```sh
  node <插件目录>/mcp/launch.mjs --check snippet.json
  ```

  macOS 上也可以直接读剪贴板：`pbpaste | node <插件目录>/mcp/launch.mjs --check`。配置没问题时打印 `[open-design] 可以使用：…`，否则打印一条以 `[open-design]` 开头、说明怎么改的消息。`<插件目录>` 是插件的安装位置：`<work root>/platform/plugins/open-design/<版本>`；从本地目录安装的，就是你选的那个目录。改好后，工具在该 Agent 下次启动 Pi 时出现。
- **“daemon not reachable”或“cannot be launched”**：Open Design 没在运行，也没能在后台启动。打开桌面版再问一次。如果这之后 Agent 仍然完全没有 Open Design 的工具，它们会在该 Agent 下次启动 Pi 时出现。
- **Open Design 没有运行时**：`list_agents` 返回空列表。在 Open Design 里配一个（第 1 步），Claude Code 最省事。
- **Local CLI 里 Pi 显示为“Pi · Inflection chat CLI”**：这是 Open Design 标错了。它就是那台机器上的 `pi` 命令，和 Loop Now 运行的是同一个程序。Open Design 单独启动它，用在 Open Design 里给它选的模型，不用 Loop Now 里 Agent 的模型。
- **一次运行像是卡住了**：5 到 30 分钟是正常的，文件可能有一阵子不变。只有想停下时才让 Agent 取消。
- **收到充值链接**：OpenDesign Cloud 的额度用完了。充值后告诉 Agent，它会接着跑同一次运行。
- Open Design 自己的 MCP 服务器在 30 分钟没有调用后会退出，下一次调用会重新启动它。

## 工作方式

MCP 条目运行 `node ./mcp/launch.mjs`。Loop Now 把插件的配置以 `LOOP_NOW_PLUGIN_OPEN_DESIGN_CONFIG` 交给 Agent 的 Pi，启动器按你粘贴的配置里的命令、参数和环境变量启动 Open Design 的 MCP 服务器，并把 Pi 的输入输出交给它。Open Design 的 MCP 服务器再把每次调用转给 `127.0.0.1` 上运行着的 Open Design；Open Design 没在运行时，先在后台启动它。启动器交给 Open Design 的环境里去掉了所有 `LOOP_NOW_*` 变量，包括该 Agent 的平台令牌。

Open Design 把项目存在它自己的数据目录里。生成的文件留在那里，除非 Agent 把它们复制到 Loop Now 的文件夹。

## 开发

需要 Node 24（测试是 TypeScript，由 Node 直接运行）。插件没有依赖。

```sh
npm test            # 配置的解析与启动器；真实的 Pi（RPC 模式、Loop Now 的启动参数）加载 Skill，并经启动器加载假的 Open Design MCP 服务器，
                    # 用离线模型发出工具调用；找不到 Pi 时跳过这部分；LOOP_NOW_TEST_PI_ROOT 指定 Pi 包目录
                    # （默认 /opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent）
(cd ../loop-now/plugins && npm ci && npm run build)
npm run validate    # node ../loop-now/plugins/host/dist/main.js validate .
```

```
loop-now-plugin-open-design/
├── package.json                清单：pi.skills、loopNow.mcpServers.desktop 与配置项 mcpServer
├── mcp/launch.mjs              MCP 服务器入口：按粘贴的配置启动 Open Design 的 MCP 服务器；--check
├── mcp/snippet.mjs             读取粘贴的配置
├── skills/open-design/SKILL.md 给 Agent 的说明
└── test/
    ├── plugin.test.ts          清单、Skill、配置与启动器；真实 Pi 里的加载、调用与重新启动
    ├── fake-od.ts              假的 Open Design MCP 服务器（stdio）
    └── fixtures/offline-provider.ts  测试用的离线模型
```

## 许可

Apache-2.0。Open Design 是其作者的独立项目，有自己的许可；本插件不包含它的任何内容。
