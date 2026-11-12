<div align="center">

# 随手记 · Suishouji

**像发消息一样记笔记。想到什么打一句发出去，它出现在你所有设备上。**

![React](https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript&logoColor=white)
![Node](https://img.shields.io/badge/Node-%E2%89%A520.11-339933?logo=nodejs&logoColor=white)
![Storage](https://img.shields.io/badge/storage-one%20JSON%20file-lightgrey)
![Platforms](https://img.shields.io/badge/platform-web%20%C2%B7%20windows%20%C2%B7%20android-black)

[快速开始](#快速开始) · [能做什么](#能做什么) · [AI](#ai-整理与对话) · [部署](#部署) · [技术札记](docs/technical-notes.md) · [设计系统](DESIGN.md)

</div>

![记录页](docs/screenshot-record.png)

自己就能跑起来的多端速记：React 前端 + 一个 Node 同步服务，数据落在**一个 JSON 文件**里，
不依赖云服务、数据库或对象存储。克隆下来 `npm i && npm run dev` 就能用。

## 为什么长这样

| 取舍 | 原因 |
| --- | --- |
| **聊天气泡，不是列表** | 速记的敌人是「打开一个表单」。气泡 + Enter 发送，把记录成本压到发一条消息那么低 |
| **写入是一条不可变的 Op** | 每条记录产生一条带 HLC 时间戳的操作，服务端按 op id 幂等收下，多端靠它收敛（[细节](docs/technical-notes.md#同步是怎么做的)） |
| **没有数据库** | 单文件 `data/db.json` + 全量内存，备份 = 拷一个文件；代价写进[已知限制](#已知限制) |
| **AI 是可选的** | 不配密钥也有一套本地确定性引擎（归类 / 摘句 / 抽待办），配上模型才做生成式推理 |

## 快速开始

### Docker（最省事）

```bash
git clone https://github.com/Ysur007/suishouji-app.git
cd suishouji-app
docker compose up -d          # 打开 http://localhost:8787
```

数据挂在 `./data`，升级只要 `git pull && docker compose up -d --build`。

### 本地开发

```bash
npm install
npm run dev
```

- 前端 [http://localhost:5173](http://localhost:5173)（Vite 已把 `/api`、`/ws` 代理到服务端）
- 同步服务 [http://localhost:8787](http://localhost:8787)

### 生产运行

```bash
npm run build     # 产物在 dist/
npm start         # 8787 单端口同时提供页面、API 与 WebSocket
```

### 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 服务端口 |
| `DATA_DIR` | `./data` | 数据目录（单文件 `db.json`） |
| `AI_API_KEY` | 空 | 填了就启用模型（OpenAI 兼容），留空走本地引擎 |
| `AI_BASE_URL` | `https://api.openai.com/v1` | 兼容 DeepSeek / Kimi / OpenRouter / vLLM / Ollama… |
| `AI_MODEL` | `gpt-4o-mini` | 模型名 |
| `AI_PROVIDER` | `auto` | `auto` / `openai` / `anthropic` / `gemini` |

> 环境变量是**全站默认值**，只对没在界面里配过的账号生效；界面保存的配置优先级更高。

## 能做什么

| 能力 | 说明 |
| --- | --- |
| 聊天式速记 | 自己的记录在右（黑底），其他设备的在左（白底）；`Enter` 发送，`Shift+Enter` 换行 |
| 多端实时同步 | 登录后两台设备打开同一地址，任一侧写入约 100ms 内出现在另一侧 |
| 离线可用 | 断网照常记，写入先落 IndexedDB，恢复后自动补发；服务端按 op id 幂等去重 |
| 账号与隔离 | 每个账号的数据按 `userId` 分区，服务端任何查询都带用户过滤 |
| 游客模式 | 不登录也能记，但不建 WebSocket、不写云端；登录时把游客记录按 HLC 合并进账号 |
| 一键到最新 | 往上翻超过一屏，右下角出现「最新」，点一下平滑回到底部 |
| 多选与分享 | 右键（手机长按）→「多选」批量分享 / 删除；分享是单独面板选群，重复分享会被跳过 |
| 整理 | 按主题聚类、抽待办（**可勾选**，勾选状态跟着记录同步）、挑出值得回看的句子 |
| 对话 | 基于自己记录的检索式问答，回答带引用原文；可流式输出、可中途停止 |
| 空间 / 时间线 / 文件夹 | 三种回顾方式：空间卡片流 + 全文搜索、按时间铺开并标注间隔、拟物图标网格 |
| 群组协作 | 建群、按用户名邀请；群里看到的是 `sharedFrom` 指向原记录的副本，原记录编辑不会带动副本 |
| 归档与置顶 | 单条记录可归档到文件夹、置顶、编辑、删除 |
| 图片 | 选择 / 拖拽 / 粘贴，客户端先压到 1600px，单条最多 4 张 |
| 备份 | 「我的 → 导出备份」可选范围（全部 / 近 30 天 / 某个群）与来源（本机 / 服务端） |
| 适配 | 桌面三栏（侧栏 + 面板 + 内容），手机单列 + 底部标签栏，按钮与手势按端区分 |

| 时间线 | 空间 |
| --- | --- |
| ![时间线](docs/screenshot-timeline.png) | ![空间](docs/screenshot-space.png) |

| 整理 | 对话 |
| --- | --- |
| ![整理](docs/screenshot-organize.png) | ![对话](docs/screenshot-chat.png) |

| 文件夹 | 移动端 |
| --- | --- |
| ![文件夹](docs/screenshot-folders.png) | ![移动端](docs/screenshot-mobile.png) |

## AI 整理与对话

| 引擎 | 触发条件 | 做法 |
| --- | --- | --- |
| `local` | 未配置密钥 | TF-IDF + 领域词表两级归类、句式摘要、正则抽待办。不联网、不发数据 |
| `llm` | 配置了模型 | 把记录摘要发给模型、要求返回固定 JSON；解析失败自动退回本地结果 |

**三步配好**（三处入口打开同一个面板：整理页 / 对话页右上角的引擎标签，或「我的 → AI 引擎」）：

1. 选服务商（OpenAI 兼容 / Anthropic / Gemini，不确定就选「自动」）；
2. 填接口地址和 API Key——地址只填到版本号，路径由服务端补全；
3. 点「测试连接」，通过后保存。

几个实现上的决定：

- **配置按账号隔离**：存 `data/ai/{userId}/ai.json`，A 填的 Key 不会出现在 B 的界面里，也不会被 B 的整理用掉；
  旧版那份全局 `data/ai.json` 在面板里显示成「导入到当前账号」，只能被一个账号领走。
- **密钥不下发浏览器**：读取接口只回 `sk-…1234` 这样的末四位，所有请求都在服务端发出。
- **模型显示别名**：`trae-cn/deepseek-v4.1-flash-max` 在界面上是 `DeepSeek V4.1 Flash Max`，
  真实 id 写在它下面——发出去的永远是原始 id。

配置细则、三种协议的差异、`fetch failed` / HTTP 520 这类报错怎么读，都在
[技术札记 · 模型接入](docs/technical-notes.md#模型接入协议与排错)。

## 多端

| 形态 | 数据在哪 | 说明 |
| --- | --- | --- |
| **Web** | 服务端 `data/db.json` | 就是这套前端 + Node 服务 |
| **Windows（Electron）** | `%APPDATA%\Suishouji\data\db.json` | 前端和服务端一起打进 exe，开箱即用；`SSJ_REMOTE=https://…` 可改为连线上那份 |
| **Android（Capacitor）** | 服务端 | 页面打包在 app 里，服务器地址可在「我的 → 本机与服务」里改，改完自动重载 |

安装包在 [Releases](https://github.com/Ysur007/suishouji-app/releases)。Windows 包未签名，
首次运行 SmartScreen 会拦（更多信息 → 仍要运行）；Android 包是 debug 签名，适合自用。

**手机连自己的电脑**：电脑 `npm start`，手机与电脑同一 Wi-Fi，浏览器打开 `http://电脑IP:8787`，
登录同一个账号即可。

### 快捷键

| 键 | 作用 |
| --- | --- |
| `⌘/Ctrl + 1 / 2 / 3 / 4` | 记录 / 整理 / 对话 / 我的 |
| `Enter` / `Shift + Enter` | 发送 / 换行 |
| `⌘/Ctrl + N` | 回记录并聚焦输入框 |
| `⌘/Ctrl + K` | 回记录并聚焦搜索 |
| `⌘/Ctrl + Enter` | 在编辑面板中保存 |
| `Esc` | 关闭菜单 / 面板 / 图片预览 |

移动端：长按气泡出菜单（复制 / 编辑 / 置顶 / 归档 / 多选 / 分享到… / 删除），点气泡进入编辑。

## 界面

三级结构，每级只回答一件事：

```
┌──────┬──────────────┬──────────────────────────────┐
│ Rail │ Panel        │ Stage                        │
│ 去哪 │ 有哪些        │ 具体内容                      │
│ 64px │ 272px        │ 自适应                        │
└──────┴──────────────┴──────────────────────────────┘
```

| 宽度 | 布局 |
| --- | --- |
| ≥ 1181px | Rail + Panel + Stage |
| 1025–1180px | Rail 64px，Panel 240px |
| 721–1024px | 只留 Rail，Panel 收进顶栏标题的「导航」抽屉；不显示底部 Tab |
| ≤ 720px | 只留 Stage，底部 4 个 Tab（记录 / 整理 / 对话 / 我的） |

![布局](docs/screenshot-layout.png)

配色、字号、间距、动效的约定在 [DESIGN.md](DESIGN.md)；「我的」页的重设计过程在
[docs/my-page-redesign.md](docs/my-page-redesign.md)。

## 同步是怎么做的

每条写入是一条带 HLC 的不可变 Op，先落本机再发服务端；服务端按 op id 幂等收下、按 HLC 后写覆盖，
再广播给同一空间的其他连接。客户端断线重连时带上 `since` 游标增量拉取，落后太多就换一份快照。

设计动机、冲突策略、弱网重投、在线设备列表的实现，见
[技术札记 · 同步](docs/technical-notes.md#同步是怎么做的)。

## 部署

```yaml
# docker-compose.yml
services:
  suishouji:
    build: .
    ports: ['8787:8787']
    environment:
      PORT: 8787
      DATA_DIR: /app/data
    volumes: ['./data:/app/data']
    restart: unless-stopped
```

放到公网时：**套一层 HTTPS 反代**（Caddy / Nginx），并记住 `data/` 里是明文记录，
备份与权限都要当数据库对待。

### 自己打包

```bash
npm run build:desktop   # Windows exe（前端 + 服务端一起打包）
npm run build:android   # 需要 Android SDK；debug 签名
```

## 账号与安全

- 四种状态：未登录 / 已登录 / 已退出 / 离线；退出**不清数据**，只停同步，重新登录会补传。
- 密码用 scrypt + 每用户独立盐；改密码会让其它设备上的登录立刻失效。
- 「我的 → 在线设备」能看每台登录过的设备，除了当前这台都能单独下线。
- **边界**：没有邮箱验证、找回密码、登录限流；没有端到端加密，服务端可读；
  token 长期有效且存在 localStorage。

## 文档

| 文件 | 内容 |
| --- | --- |
| [DESIGN.md](DESIGN.md) | 设计系统：颜色、字号、间距、动效、组件约定 |
| [docs/technical-notes.md](docs/technical-notes.md) | 选型与架构、同步协议、模型接入协议与排错、接口一览、目录结构 |
| [docs/my-page-redesign.md](docs/my-page-redesign.md) | 「我的」页的重设计：现状盘点、方案、实施记录、后续建议 |

## 已知限制

- 数据是**单文件 JSON + 全量内存**，适合个人 / 小团队；几十人并发写应换 SQLite / Postgres（Op 模型不用改，只换持久化层）。
- 账号体系是最小实现：没有找回密码、邮箱验证、登录失败限流。
- 记录没有端到端加密，`data/db.json` 里是明文。
- 图片以 base64 存在记录里，单条 4 张、每张压到 1600px；大量放图应改成对象存储 + URL。
- 冲突粒度是**整条记录**的后写覆盖，两人同一秒改同一条会丢掉其中一次（要逐字合并得换 CRDT）。
- 界面只有中文。

## 最近更新

- **v1.3.12** — 记录页「回到最新」；右键多选（批量分享 / 删除）；分享改成单独面板选群，重复分享自动跳过
- **v1.3.11** — `fetch failed` 拆出真实原因（`err.cause` + DNS 诊断）；模型显示别名
- **v1.3.10** — 整理页的待办可以勾选，状态存在记录上、随设备同步
- **v1.3.9** — 消息流只在日期行画分隔线（修掉每条气泡都带横线的类名冲突）

完整记录见 `git log`。
