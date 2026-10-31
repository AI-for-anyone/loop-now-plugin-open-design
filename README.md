# Loop Now for Open Design

[中文](https://github.com/AI-for-anyone/loop-now-plugin-open-design/blob/main/README.zh-CN.md)

A [Loop Now](https://github.com/AI-for-anyone/loop-now) plugin that lets Agents work with [Open Design](https://open-design.ai) through **the MCP server of the Open Design desktop app**. Agents can have Open Design generate and refine web pages, product prototypes, landing pages, decks, images and motion. They can also read a design's files, copy them into a Loop Now folder, and read Open Design's design systems.

It is an Agent-only plugin: one Skill, one MCP server entry, and one setting where you paste Open Design's MCP configuration. The Skill tells the Agent how to commission a design, how long to wait, and when to stop and ask you. The plugin needs no permissions or accounts in Loop Now.

## Before you start

- **Open Design generates with its own runtime, not with Loop Now's models.** A design is made by whatever Open Design is set up to use: a coding agent CLI on that machine (Claude Code, Codex, Cursor, OpenCode, Pi and others) or OpenDesign Cloud. The model accounts you set up for Pi in Loop Now are not used. The runtime is configured, and billed, separately. The simplest choice is Claude Code: if it is installed and signed in on that machine, Open Design finds it on the PATH.
- **Open Design must be running** on the machine where Loop Now runs whenever an Agent uses it, so keep the desktop app open. If it is closed, Open Design's MCP server tries to start Open Design in the background, without a window, and waits up to a minute for it. Open Design then keeps running in the background after the Agent is done.
- **A run takes 5 to 30 minutes.** The Agent checks on it every 30 to 60 seconds and tells you when it is done.
- **Open Design collects usage data by default.** On first launch it asks you to choose **Share** or **Don't share**. Official builds also always send scrubbed crash and reliability reports. See Open Design's [privacy page](https://github.com/nexu-io/open-design/blob/main/PRIVACY.md).
- **Open Design does not produce .pptx or .pdf files through MCP.** Decks come out as HTML; you export PPTX or PDF yourself in the Open Design app.

## Requirements

- A Loop Now build from October 30, 2026 or later.
- The Open Design desktop app on the same machine as Loop Now: macOS (Apple silicon or Intel) or Windows (x64). Open Design has no prebuilt Linux build; running it from source is not covered here.
- A runtime Open Design can use, as above.

## 1. Set up Open Design

1. Download the desktop app from [open-design.ai](https://open-design.ai) or [GitHub Releases](https://github.com/nexu-io/open-design/releases) and install it.
2. On first launch, choose **Share** or **Don't share** in the privacy banner. You can change this later under **Settings › Privacy**.
3. Choose a runtime: **Settings › Models & providers**. Under **Local CLI**, Open Design lists the coding agent CLIs it found on the PATH; if yours is missing, make sure its folder is on the PATH of the app and click **Rescan**. Alternatively, sign in to OpenDesign Cloud.
4. Make one small design in the app, to be sure the runtime works.

## 2. Copy Open Design's MCP configuration

In Open Design, open **Settings › OpenDesign MCP**, choose **Cursor** or **Kiro CLI**, and copy the JSON it shows. It starts with `{"mcpServers"`. The `claude mcp add-json …` command on the **Claude Code** page works too; copy the whole line. The **Codex** page shows TOML, which does not work here.

The configuration holds absolute paths into the Open Design app. Do not shorten the command to `od`: on macOS, `/usr/bin/od` is a system tool that hides Open Design's `od`. Copy it again after Open Design is updated or moved.

## 3. Install the plugin in Loop Now

In the console: **Plugin market** › **Install plugin**, source **git repository**, **Repository URL** `https://github.com/AI-for-anyone/loop-now-plugin-open-design.git`. Or with the CLI:

```sh
loopctl plugin install https://github.com/AI-for-anyone/loop-now-plugin-open-design.git@main --force
```

`--force` confirms a source that is not an official plugin. The plugin has no dependencies, so nothing is downloaded.

## 4. Paste the configuration

**Plugin market** › **Open Design** › **Details** › **Config**: paste what you copied into the one field, `mcpServer` (shown as **Open Design 的 MCP 配置**, "Open Design's MCP configuration"), and save. The setting applies to all projects.

## 5. Enable it and grant it to Agents

1. **Project settings** › **Plugins** › **Manage project plugins**: enable **Open Design**.
2. In the config of each Agent that should use it, under **Plugin grants**: grant **Open Design** and save.

The tools are named `mcp__open_design_desktop__*`. They take effect the next time the Agent's Pi starts. The platform stops an idle Agent's Pi after a while (10 minutes by default), and the next message starts a new one.

## Check that it works

With the Open Design app open, ask the Agent: "Which runtimes can Open Design use?" It calls `mcp__open_design_desktop__list_agents` and lists them. If the Agent says it has no Open Design tools, see **Troubleshooting**.

## Use it

- **Ask for a design**, for example: "Use Open Design to make a landing page for our note-taking app, in the Linear design system." The Agent asks in the conversation for anything that is missing; Open Design's question cards are not shown in Loop Now. It then creates an Open Design project, starts a run, and checks on it until it is done. You get the project name and a preview link. The link is a `127.0.0.1` address on the Loop Now machine, so open it in a browser there, or open the project in the Open Design app.
- **Change a design**: "Make the hero section darker and shorten the headline." The Agent starts a new run on the same project.
- **Get the files**: "Copy the design's files into the project folder." The Agent fetches the entry file and everything it references, and writes them where you said.
- **Decks and documents**: Open Design makes HTML decks you view in the browser. For a .pptx or .pdf, export it in the Open Design app.
- **The Agent's own model**: the Agent writes a design itself, without Open Design's runtime, only if you explicitly ask it to. That skips Open Design's skill pipeline, and Open Design does not recommend it.
- The Agent does not delete Open Design projects or files unless you ask it to and say which.

## Tools

| Tools | Use |
|---|---|
| `create_project`, `list_projects`, `get_project` | Create a project to generate into; find a project; project details and preview link |
| `start_run`, `get_run`, `cancel_run` | Have Open Design generate or change a design; check on the run; stop it |
| `list_agents`, `list_skills`, `list_plugins` | Runtimes, skills and workflows Open Design can use |
| `get_artifact`, `get_file`, `search_files`, `list_files` | Read a design's files |
| `create_artifact`, `write_file`, `delete_file`, `delete_project` | Write or delete files and projects (used only when you ask) |
| `get_active_context` | The project you have open in Open Design right now |
| `start_vela_login`, `get_vela_login_status` | Sign in to OpenDesign Cloud |
| `collect_brief`, `confirm_brief` | Open Design's question cards; not used, since Loop Now cannot show them |

Open Design's design systems and skills are also offered as MCP resources (`od://design-systems/<id>/DESIGN.md`, `od://skills/<id>/SKILL.md`), which the Agent reads with Pi's `read_mcp_resource`. The tools and their parameters are whatever the installed Open Design offers.

## Troubleshooting

- **The Agent has no Open Design tools**, and the chat may show a notice that `open-design-desktop` failed. The plugin could not start Open Design's MCP server, usually because `mcpServer` is empty, is not the JSON, or is out of date after Open Design was updated or moved. To see the exact reason, save what you pasted to a file and check it on the Loop Now machine:

  ```sh
  node <plugin folder>/mcp/launch.mjs --check snippet.json
  ```

  On macOS you can pipe the clipboard instead: `pbpaste | node <plugin folder>/mcp/launch.mjs --check`. It prints `[open-design] 可以使用：…` ("can be used") when the configuration is fine, or a message starting with `[open-design]` that says what to fix. `<plugin folder>` is where the plugin is installed: `<work root>/platform/plugins/open-design/<version>`, or the folder you chose for a local install. Once fixed, the tools appear the next time the Agent's Pi starts.
- **"daemon not reachable"** or **"cannot be launched"**: Open Design is not running and could not be started in the background. Open the desktop app and ask again. If the Agent has no Open Design tools at all after this, they appear the next time its Pi starts.
- **Open Design has no runtime**: `list_agents` comes back empty. Set one up in Open Design (step 1); Claude Code is the simplest.
- **A run seems stuck**: 5 to 30 minutes is normal, and files may not change for a while. Ask the Agent to cancel only if you want to stop it.
- **A recharge link**: OpenDesign Cloud is out of credits. Top up, tell the Agent, and it resumes the same run.
- Open Design's own MCP server stops after 30 minutes without calls; the next call starts it again.

## How it works

The MCP entry runs `node ./mcp/launch.mjs`. Loop Now passes the plugin's settings to the Agent's Pi as `LOOP_NOW_PLUGIN_OPEN_DESIGN_CONFIG`, and the launcher starts the command from your pasted configuration with its arguments and environment, handing it Pi's input and output. Open Design's MCP server then relays every call to the running Open Design app on `127.0.0.1`, and starts Open Design in the background first if it is not running. The launcher removes all `LOOP_NOW_*` variables, including the Agent's platform token, from the environment it gives to Open Design.

Open Design keeps its projects in its own data folder. Generated files stay there unless an Agent copies them into a Loop Now folder.

## Development

Requires Node 24, which runs the TypeScript tests directly. The plugin has no dependencies.

```sh
npm test            # snippet parsing and the launcher; a real Pi (RPC mode, Loop Now's launch flags) loads the Skill and,
                    # through the launcher, a fake Open Design MCP server; an offline model makes the tool calls
                    # the Pi part is skipped when Pi is not found; LOOP_NOW_TEST_PI_ROOT points at the Pi package
                    # (default /opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent)
(cd ../loop-now/plugins && npm ci && npm run build)
npm run validate    # node ../loop-now/plugins/host/dist/main.js validate .
```

```
loop-now-plugin-open-design/
├── package.json                manifest: pi.skills, loopNow.mcpServers.desktop and the mcpServer setting
├── mcp/launch.mjs              MCP server entry: starts Open Design's MCP server from the pasted configuration; --check
├── mcp/snippet.mjs             reads the pasted configuration
├── skills/open-design/SKILL.md instructions for the Agent
└── test/
    ├── plugin.test.ts          manifest, Skill, configuration and launcher; loading, calls and restarts in a real Pi
    ├── fake-od.ts              fake Open Design MCP server (stdio)
    └── fixtures/offline-provider.ts  offline model for the tests
```

## License

Apache-2.0. Open Design is a separate project by its authors, under its own licenses; this plugin does not include any of it.
