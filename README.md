# 随手记 · Suishouji

> 像发消息一样记笔记。想到什么打一句就发出去，它会在你的所有设备上同时出现。

一个自己就能跑起来的多人多端速记应用：React 前端 + 一个几十行的 Node 同步服务，
数据存在一个 JSON 文件里，不依赖任何云服务和数据库。

![记录页](docs/screenshot-record.png)

---

## 目录

- [能做什么](#能做什么)
- [技术方案](#技术方案)
- [同步是怎么做的](#同步是怎么做的)
- [快速开始](#快速开始)
- [多端互通怎么用](#多端互通怎么用)
- [配置](#配置)
- [Docker 部署](#docker-部署)
- [快捷键](#快捷键)
- [目录结构](#目录结构)
- [已知限制](#已知限制)

---

## 能做什么

| 能力 | 说明 |
| --- | --- |
| 聊天式速记 | 自己发的记录在右侧（黑底），其他设备的记录在左侧（白底），Enter 直接发送，Shift+Enter 换行，⌘/Ctrl+Enter 也可发送 |
| 账号与隔离 | 注册 / 登录 / 退出；每个账号的数据库记录按 `userId` 分区，服务端任何查询都带用户过滤，A 看不到 B 的任何内容 |
| 游客模式 | 未登录时可正常记录，但**不建立 WebSocket、不写云端**，全部落在本机 IndexedDB；侧栏显示「本地模式」 |
| 登录合并 | 登录/注册时把本机游客记录按 HLC 重放并并入账号，与云端旧记录冲突时按后写覆盖收敛；合并后清空游客分区 |
| 多端实时同步 | 登录后两台设备打开同一地址，任一侧写入 ~100ms 内出现在另一侧；侧边栏只显示同账号的在线设备 |
| 离线可用 | 断网时照常记录，写入先落本机 IndexedDB，恢复网络后自动补发，服务端按 op id 幂等去重 |
| 时间线 | 按发生时间正序铺开所有记录：日期分组、时刻、与上一条的间隔、`#序号/总数`、当天第几条、所属文件夹与来源设备 |
| 空间 / 文件夹 | 「空间」用卡片流回顾全部记录，支持全文搜索与按文件夹筛选；「文件夹」是拟物 3D 图标网格 |
| 归档与置顶 | 单条记录可归档到文件夹、置顶、编辑、删除 |
| 图片 | 支持选择、拖拽、粘贴图片，客户端先等比压缩到 1600px 再入库，单条最多 4 张 |
| 备份 | 设置里可导出 / 导入 JSON，服务端也提供 `/api/export` 整包下载 |
| 深浅两端的适配 | 桌面是三栏（侧栏 + 单列流），移动端是单列 + 底部标签栏，按钮与手势按端区分 |

| 时间线 | 空间 |
| --- | --- |
| ![时间线](docs/screenshot-timeline.png) | ![空间](docs/screenshot-space.png) |

| 文件夹 | 移动端 |
| --- | --- |
| ![文件夹](docs/screenshot-folders.png) | ![移动端](docs/screenshot-mobile.png) |

---

## 技术方案

### 选型

| 层 | 选择 | 原因 |
| --- | --- | --- |
| 视图 | React 19 + TypeScript | 组件化、生态成熟；严格模式让数据模型无处可藏 |
| 构建 | Vite 6 | 冷启动快，配置面小；生产构建 8s 左右 |
| 动画 | Framer Motion 11 | 弹簧动画、`AnimatePresence` 退场、`layoutId` 滑动指示器都是一行代码级的能力 |
| 状态 | Zustand 5 | 比 Context 少一层重渲染，比 Redux 少一堆样板；store 里直接放业务动作 |
| 样式 | 原生 CSS + 设计令牌 | 黑白高对比：没有强调色，靠反白与边框建立层级；分层阴影、`backdrop-filter`、3D 变换都需要手写控制 |
| 服务端 | Node 22 + `ws` + 原生 `http` | 只有两个职责：静态托管 + 实时同步，不需要框架 |
| 存储 | 单文件 JSON（原子写） | 个人笔记量级（万条内）下最省心的方案，备份就是拷一个文件；记录键为 `userId|entity:id`，天然按账号分区 |
| 认证 | scrypt 口令哈希 + 随机 token | 口令只存盐与哈希，token 存在 localStorage、随 WebSocket hello 一起校验 |
| 本地缓存 | IndexedDB（手写 60 行封装） | 刷新后立刻有内容，不引额外依赖 |

整套只有一个 `package.json`、一套依赖，`npm install` 之后就能跑。

### 架构

```
┌────────────────┐        WebSocket (/ws)        ┌──────────────────────┐
│  浏览器 A        │ ◀──────────────────────────▶ │                      │
│  React + Zustand│                               │  Node 同步服务         │
│  IndexedDB 缓存 │        HTTP (/api/*, 静态)     │  · 操作日志 op log     │
└────────────────┘ ◀──────────────────────────▶ │  · 记录快照 records    │
                                               │  · 在线设备 presence   │
┌────────────────┐        WebSocket             │                      │
│  浏览器 B / 手机  │ ◀──────────────────────────▶ │  持久化 → data/db.json │
└────────────────┘                               └──────────────────────┘
```

服务端不做业务判断，只做三件事：**排序（发 seq）、去重（按 op id）、广播**。
所有冲突消解逻辑都在客户端，两边用同一套规则，因此谁先连上谁后连上都不影响最终结果。

### 数据模型

```ts
type Memo = {
  id: string; text: string; images: string[]; folderId: string | null;
  pinned: boolean; createdAt: number; updatedAt: number;
  hlc: string;        // 最后一次写入的混合逻辑时钟
  deleted: boolean;   // 墓碑，删除也要同步
};
type Folder = { id; name; glyph; tone; createdAt; updatedAt; hlc; deleted };
```

删除是墓碑而不是物理删除：这样「A 设备删除、B 设备离线又编辑」的情况也能收敛到同一个结果。

---

## 同步是怎么做的

### 一次写入 = 一条不可变的 Op

```ts
type Op = {
  id: string;          // 本次操作唯一 id（幂等键）
  entityId: string;    // 被操作的记录 id
  clientId: string;    // 哪台设备写的
  hlc: string;         // 混合逻辑时钟
  entity: 'memo' | 'folder';
  kind: 'put' | 'del';
  data?: Record<string, unknown>;  // put 时携带完整记录
};
```

客户端本地先应用（乐观更新），再把 Op 放进队列，60ms 内的连续操作合并成一批发出。

### 冲突消解：HLC + 后写覆盖

`hlc` 形如 `000001791234567890-0000-a1b2c3d4`：前 16 位是毫秒时间戳，中间 4 位是同毫秒计数器，
最后是设备 id。它保证：

- **因果有序**：收到远端更大的时钟后，本地计数器会推进（`observeHLC`），本机新写入不会排到旧位置；
- **全序可比**：字符串比较即大小，服务端只做 `if (existing.hlc >= op.hlc) return` 这一行判断；
- **时钟回拨安全**：同一毫秒内计数器自增，不依赖系统时钟单调。

同一条记录上，谁的 hlc 更大谁赢——这就是最朴素的 LWW（last-write-wins）。

### 增量拉取与快照重置

服务端给每条 Op 分配单调递增的 `seq`，客户端把已确认的 `seq` 存在 localStorage：

- 连上后发 `hello { since }`，服务端回 `sync { ops: seq > since }`，只补差额；
- 操作日志超过 6000 条会裁剪到 3000 条，`minSeq` 随之上移；如果客户端的 `since` 太旧，
  服务端直接回 `reset { records }` 全量快照，客户端按 hlc 合并（本地更新的记录不会被覆盖）。

### 弱网与重复投递

- 发送后先移到 `inflight`，收到 `ack` 才丢弃；连接断开时把 `inflight` 放回队列重发；
- 服务端记录见过的 op id，重复投递只会原样返回旧的 seq，不会二次写入；
- 断线重连用指数退避（0.6s → 8s，带抖动），`online` 事件和页面重新可见时立即重连。

### 在线设备

每个 WebSocket 连接登记 `clientId / name / platform`，连接与断开时向所有人广播 `presence`。
侧边栏的彩色小方块就是「另一台设备」，点开设置能看到设备名列表。

---

## 快速开始

### 环境

- Node.js **≥ 20.11**（推荐 22）
- 现代浏览器（Chrome / Edge / Safari / Firefox）

### 安装与开发

```bash
npm install
npm run dev
```

- 前端：<http://localhost:5173>
- 同步服务：<http://localhost:8787>（Vite 已把 `/api` 与 `/ws` 代理过去）

### 生产运行

```bash
npm run build     # 产物在 dist/
npm start         # 单端口 8787 同时提供页面、API 与 WebSocket
```

打开 <http://localhost:8787> 即可。数据默认写在 `data/db.json`。

### 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 服务端口（同时影响 Vite 开发代理的目标端口） |
| `DATA_DIR` | `./data` | 数据目录，`db.json` 落在这里 |

---

## 多端互通怎么用

1. 在电脑上 `npm start`；
2. 手机与电脑连同一个 Wi-Fi，用手机浏览器打开 `http://<电脑局域网IP>:8787`；
3. 两端侧边栏/设置里会互相看到对方在线，任意一端记录，另一端即时出现。

想让外网也能同步，把服务放到一台有公网 IP 的机器或容器里即可；如果前面挂 Nginx，
记得把 `/ws` 升级为 WebSocket 并透传 `Upgrade`：

```nginx
location / {
  proxy_pass http://127.0.0.1:8787;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
```

HTTPS 下前端会自动把 `ws://` 换成 `wss://`，无需改代码。


---

## 账号与数据隔离

![登录](docs/screenshot-auth.png)

### 三种状态

| 状态 | 数据落点 | 是否联网 | 界面提示 |
| --- | --- | --- | --- |
| 未登录（游客） | 仅本机 IndexedDB（`state:guest`） | 不建立 WebSocket | 徽标「本地模式」，侧栏「未登录 · 仅本机」 |
| 已登录 | 本机分区 `state:u:<userId>` + 云端该账号分区 | 实时同步 | 徽标「已同步」，侧栏 `@用户名` |
| 登录失效 | 回退到游客，账号数据留在账号分区 | 断开 | 顶部提示「登录已失效，已切回本地模式」 |

### 登录时发生了什么

1. 把当前游客分区与目标账号在本机的快照按 `hlc` 合并（后写覆盖）；
2. 写入账号分区，同时清空游客分区，避免同一条记录以游客身份再次出现；
3. 把**来自游客的那部分记录**按原 `hlc` 重放为 Op 推给服务端——服务端只接受比现有版本更新的写入，
   所以「本地较旧、云端较新」的情况不会被本地覆盖；
4. 建立 WebSocket，用该账号的 `since` 做增量拉取，补齐其他设备写入的内容。

### 退出登录

先把当前内容写盘到账号分区，再断开连接、清空内存与游客分区。此后新记录进入游客分区，不再上传；
同一账号下次登录时，这批游客记录会按上面的流程重新并入。

### 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/register` | `{username, password}` → `{token, user}`；用户名重复返回 409 |
| POST | `/api/auth/login` | 同上，口令错误返回 401 |
| POST | `/api/auth/logout` | 需 `Authorization: Bearer <token>`，使 token 失效 |
| GET | `/api/auth/me` | 校验 token，返回当前用户 |
| GET | `/api/snapshot?since=N` | 需登录，只返回该用户的增量或快照 |
| POST | `/api/ops` | 需登录，写入该用户分区 |
| GET | `/api/export` | 需登录，导出该用户全部记录 |

### 安全边界（务必阅读）

- 口令用 `scrypt` + 每用户随机盐哈希，比对用 `timingSafeEqual`；服务端不存明文口令。
- **记录本身没有端到端加密**：能读到 `data/db.json` 的人可以读到全部内容。要真正做到「服务端也看不见」，需要再加一层客户端加密。
- token 存在 `localStorage`，有效期不设上限（服务端可随时删除）。公网部署请务必上 HTTPS，否则 token 会在链路上裸奔。
- 没有找回密码、邮箱验证、登录失败限流，这三件事属于「生产必需、示例不做」的范围。

---

## Docker 部署

```bash
docker compose up -d --build
# 访问 http://localhost:8787
```

`docker-compose.yml` 已把 `./data` 挂载到容器内，升级镜像不会丢数据。

---

## 快捷键

| 快捷键 | 作用 |
| --- | --- |
| `Enter` | 发送当前记录 |
| `Shift + Enter` | 换行 |
| `⌘ / Ctrl + Enter` | 在编辑面板中保存 |
| `⌘ / Ctrl + N` | 跳到输入框 |
| `⌘ / Ctrl + K` | 跳到「空间」并聚焦搜索 |
| `Esc` | 关闭菜单 / 面板 / 图片预览 |

移动端：长按气泡弹出操作菜单（复制 / 编辑 / 置顶 / 归档 / 删除），点击气泡进入编辑。

---

## 目录结构

```
.
├── server/
│   ├── index.ts        # HTTP + WebSocket + 静态托管
│   ├── store.ts        # 操作日志、快照、原子写盘
│   └── types.ts        # 同步协议类型
├── src/
│   ├── components/     # 视图与交互组件
│   ├── lib/
│   │   ├── store.ts    # Zustand store：数据 + 业务动作
│   │   ├── sync.ts     # WebSocket 客户端：队列、重连、增量
│   │   ├── hlc.ts      # 混合逻辑时钟
│   │   ├── idb.ts      # IndexedDB 键值封装
│   │   └── bus.ts      # store → sync 的操作总线
│   ├── styles/         # 设计令牌 + 组件样式
│   └── App.tsx
├── DESIGN.md           # 设计系统说明
└── vite.config.ts
```

---

## 已知限制

- 数据是**单文件 JSON + 全量内存**，适合个人 / 小团队；如果要几十人并发写，换 SQLite 或 Postgres 更合适（Op 模型不用改，只换持久化层）。
- 账号体系是最小实现：没有找回密码、邮箱验证、登录失败限流；token 长期有效且存在 localStorage。
- 记录没有端到端加密，服务端可读；`data/db.json` 里能看到所有账号的明文内容。
- 图片以 base64 存在记录里，单条 4 张、每张压到 1600px 以内；如果要大量放图，应该改成对象存储 + URL 引用。
- 冲突策略是整条记录级的「后写覆盖」，两个人在同一秒改同一条记录会丢掉其中一次修改（个人速记场景可以接受，需要逐字合并就得换成 CRDT）。
