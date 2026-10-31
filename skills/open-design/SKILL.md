---
name: open-design
description: 通过 Open Design 生成或修改设计：网页与产品原型、落地页、演示稿、图片、动效、设计系统，或读取 Open Design 项目里的设计文件。用户要做设计稿、原型、演示稿，或提到 Open Design 时使用。工具来自本机 Open Design 桌面版的 MCP 服务器（mcp__open_design_desktop__ 开头）；生成交给 Open Design 自己的运行时，一次 5 到 30 分钟。
---

# Open Design（桌面版 MCP）

工具名都以 `mcp__open_design_desktop__` 开头，来自 Loop Now 所在机器上 Open Design 桌面版的 MCP 服务器。每个工具的参数以它声明的参数说明为准；下面说的是怎么用、什么时候停下来问用户。

生成不是你自己做的：`start_run` 把任务交给 Open Design，由它用自己的运行时（它那台机器上的 Claude Code、Codex 等命令行 Agent，或 OpenDesign Cloud）按它的 Skill 与设计系统完成。用的是 Open Design 那边配置的模型和账号，不是你的。

## 生成或修改一份设计（默认做法）

1. **先把需求问清楚。** Loop Now 不显示 Open Design 的问卷卡片，所以不要调用 `collect_brief`、`confirm_brief`；缺的信息在对话里问用户：要做什么、给谁看、品牌或风格、页数或屏数、语言。用户说“PPT”“演示稿”“PDF”“文档”时，先问清要的是 Open Design 在浏览器里展示的 HTML 版，还是 .pptx／.pdf 文件：Open Design 不直接产出这些文件，要由用户在 Open Design 里导出。
2. **选项目。** 新设计用 `create_project` 建一个（`name` 用简短的项目名；用户指定了设计系统时传 `designSystem`）。改已有的设计时用 `list_projects` 找到它，确认是哪一个。
3. **看有哪些运行时。** 调 `list_agents`。列表为空时，把 Open Design 的回复原样转给用户，请他在 Open Design 里装好或选好运行时，然后停下，不要自己想办法绕过。用户没指定时不传 `agent`，用 Open Design 里的默认设置。跟用户提到运行时时，用列表里的名称，不要用 id。
4. **发起。** 先生成一个 UUID 作为 `requestId`（例如 `node -e "console.log(crypto.randomUUID())"`），再调 `start_run`：`project`、`prompt`（把第 1 步问到的内容写完整）、`requestId`；用户点名了某个 Skill 时传 `skill`（可选的 id 见 `list_skills`）。记下返回的 `runId`。调用超时或没拿到回复时，用**同一个** `requestId` 和同样的参数再调一次，不要换新的。
5. **等它做完。** 一次运行通常要 5 到 30 分钟。每隔 30 到 60 秒调一次 `get_run`（中间用 shell 的 `sleep 45` 等），状态是 queued 或 running 就继续等，文件一时没变化也是正常的。不要因为慢就取消，也不要另起一次；只有用户要求时才调 `cancel_run`。等的时候可以告诉用户还在进行。
6. **交付。** 状态是 succeeded 时，把项目名和 `previewUrl` 告诉用户：这是 Loop Now 那台机器上的本机地址，在那台机器的浏览器或 Open Design 里打开。没有 `previewUrl` 时，把 `agentMessage` 转给用户（多半是 Open Design 那边有问题要问）。用户要把文件放进你的文件夹或项目文件夹时，用 `get_artifact` 一次取回入口文件和它引用的文件，再写到用户指定的位置。
7. **失败。** 状态是 failed 或 canceled 时，把 Open Design 给的错误原样转给用户。返回里有 `failureAction: "recharge"` 时，把 `rechargeUrl` 给用户；用户确认充值后，用原来的 `requestId` 和完全相同的参数、加上 `resume: true` 再调一次 `start_run`。

修改已有设计也是这个流程：在第 4 步的 `prompt` 里写清改什么，`project` 填那个项目。

## 读设计

- `get_artifact`：入口文件加上它引用的样式、组件、图片，一次取回。要了解或沿用一份设计时先用它。
- `get_file`、`search_files`、`list_files`、`get_project`：单个文件、按文字搜索、文件列表、项目信息（含 `previewUrl`）。
- 设计系统和 Open Design 的 Skill 是 MCP 资源：用 `list_mcp_resources`（`server` 填 `open-design-desktop`）列出，用 `read_mcp_resource` 读 `od://design-systems/<id>/DESIGN.md` 或 `od://skills/<id>/SKILL.md`。
- 不传 `project` 时，这些工具用的是用户此刻在 Open Design 里打开的项目；用户没在看 Open Design 时会提示没有，这时传 `project`。

## 只在用户明确要求时：用你自己的模型直接写

只有用户在对话里明确要你自己写、不用 Open Design 的运行时，才这样做：先用 `read_mcp_resource` 读要用的 DESIGN.md，自己写出 HTML（或 SVG、Markdown），用 `create_artifact` 在 Open Design 项目里新建入口文件，之后用 `write_file` 修改。开始前告诉用户：这跳过了 Open Design 的 Skill 流水线，Open Design 不推荐这样做，效果可能不如 `start_run`。不要因为运行时没配好、运行慢或失败就自己改走这条路。

## 连不上或用不了时

- **没有 `mcp__open_design_desktop__` 开头的工具**：插件的 MCP 服务器没起来，通常是插件配置里还没粘贴 Open Design 的 MCP 配置，或 Open Design 更新、换了位置后配置过时了。请用户按插件说明在 Open Design 的 Settings › OpenDesign MCP 里重新复制，粘到插件配置的 mcpServer。工具在你的 Pi 下次启动时出现（平台在 Agent 空闲约 10 分钟后回收 Pi）。
- **调用返回守护进程连不上（daemon not reachable）或启动不了（cannot be launched）**：Open Design 没在运行，也没能在后台自动启动。把原话转给用户，请他打开 Open Design 桌面版；他说开好了再调。
- **要登录 OpenDesign Cloud**：只在用户要用 OpenDesign Cloud 时，先 `get_vela_login_status`；没登录就 `start_vela_login`，把返回的链接和验证码给用户，等他完成后再查状态。
- 其他报错：原样转给用户，说明卡在哪一步，等用户决定。不要换别的工具或别的做法绕过去。

## 不要做的事

- 不要调用 `delete_project`、`delete_file`，除非用户明确要求删除，并且说清了删哪个。
- 不要把 `runId`、`requestId`、运行时 id 之类的内部值当成给用户看的说法；要提到时说项目名和设计名。
