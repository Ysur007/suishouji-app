/**
 * 重新生成 docs/screenshot-*.png。
 *
 * 用法：起一个**干净**的实例，然后
 *   PORT=9452 DATA_DIR=/tmp/data-shots npx tsx server/index.ts &
 *   node scripts/shots.mjs
 *
 * 会用 demo / demo1234 造一套演示数据（14 条记录 + 1 个群 + 3 个文件夹），
 * 再按固定尺寸截图到 /tmp/shots（桌面 1280×800@1.5，手机 390×844@2），
 * 跑完把文件拷进 docs/ 即可。数据是假的，不要指向生产实例。
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:9452';
const OUT = '/tmp/shots';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const post = async (path, body, token) =>
  (
    await fetch(BASE + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body || {}),
    })
  ).json();

/* ------------------------------ 造数据 ------------------------------ */

const demo = await post('/api/auth/register', { username: 'demo', password: 'demo1234' });
const alan = await post('/api/auth/register', { username: 'alan', password: 'demo1234' });
const T = demo.token;
const TA = alan.token;
const uid = demo.user.id;
const uSpace = `u:${uid}`;

const pad = (n, w) => String(n).padStart(w, '0');
let seq = 0;
const hlcAt = (ts) => `${pad(ts, 16)}-${pad(++seq, 4)}-shot`;
const uid4 = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20);

const ops = [];

// 文件夹
const folders = [
  { name: '工作', glyph: 'code', tone: 'clay' },
  { name: '生活', glyph: 'wave', tone: 'moss' },
  { name: '想法', glyph: 'spark', tone: 'plum' },
].map((f, i) => {
  const ts = Date.now() - (30 - i) * 86400_000;
  const hlc = hlcAt(ts);
  const id = uid4();
  ops.push({
    id: crypto.randomUUID(),
    entityId: id,
    clientId: 'seed',
    hlc,
    entity: 'folder',
    kind: 'put',
    spaceId: uSpace,
    data: { id, ...f, createdAt: ts, updatedAt: ts, hlc, deleted: false },
  });
  return { id, name: f.name };
});
const [work, life, idea] = folders;

const day = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return (h, m) => {
    const x = new Date(d);
    x.setHours(h, m, 0, 0);
    return x.getTime();
  };
};
const today = day(0);
const yest = day(1);
const before = day(2);

const memos = [
  ['把首页的加载状态改成骨架屏，别再用转圈', today(9, 12), work.id],
  ['会议：下周三前给出同步冲突的方案', today(10, 5), work.id],
  ['楼下咖啡买一送一，记得带杯子', today(11, 40), life.id],
  ['给妈妈打个电话', today(14, 2), life.id],
  ['想做一个只能写一句话的输入框，别的都藏起来', today(16, 31), idea.id],
  ['跑步 3 公里，配速 6′10″', today(19, 22), life.id],
  ['读了《置身事内》第二章，土地财政那段值得再读一遍', yest(8, 50), idea.id],
  ['午饭吃了家新开的面馆，番茄牛腩不错', yest(12, 15), life.id],
  ['周末露营：天幕、气罐、折叠椅、驱蚊水', yest(15, 47), life.id],
  ['把「整理」的待办做成可勾选，勾完要能同步到别的设备', yest(21, 3), work.id],
  ['设计稿 v3 过审，改了两处圆角', before(9, 30), work.id],
  ['记得取快递，别忘带伞', before(13, 12), life.id],
  ['和 alan 对了一下群共享的逻辑：副本带 sharedFrom，原记录改了不会跟着变', before(18, 0), work.id],
  ['睡前把手机的自动备份打开', before(22, 10), life.id],
];

for (const [text, ts, folderId] of memos) {
  const hlc = hlcAt(ts);
  const id = uid4();
  ops.push({
    id: crypto.randomUUID(),
    entityId: id,
    clientId: 'seed',
    hlc,
    entity: 'memo',
    kind: 'put',
    spaceId: uSpace,
    data: {
      id,
      authorId: 'seed',
      ownerId: uid,
      ownerName: 'demo',
      spaceId: uSpace,
      text,
      images: [],
      folderId,
      pinned: false,
      createdAt: ts,
      updatedAt: ts,
      hlc,
      deleted: false,
    },
  });
}

const sendOps = async (list, token) =>
  fetch(BASE + '/api/ops', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ ops: list }),
  });

await sendOps(ops, T);

// 群 + 群消息
const g = await (await fetch(BASE + '/api/groups', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${T}` },
  body: JSON.stringify({ name: '露营小队' }),
})).json();
await fetch(BASE + '/api/groups/invite', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${T}` },
  body: JSON.stringify({ groupId: g.group.id, usernames: ['alan'] }),
});

const gSpace = `g:${g.group.id}`;
const gMemos = [
  ['周六八点在地铁口集合，别迟到', today(8, 40), uid, 'demo', T],
  ['我带天幕和炉子', today(9, 5), alan.user.id, 'alan', TA],
  ['那我带椅子和水', today(9, 12), uid, 'demo', T],
  ['天气预报说有小雨，记得带件冲锋衣', today(10, 30), alan.user.id, 'alan', TA],
];

for (const [text, ts, ownerId, ownerName, token] of gMemos) {
  const hlc = hlcAt(ts);
  const id = uid4();
  await sendOps(
    [
      {
        id: crypto.randomUUID(),
        entityId: id,
        clientId: 'seed',
        hlc,
        entity: 'memo',
        kind: 'put',
        spaceId: gSpace,
        data: {
          id,
          authorId: 'seed',
          ownerId,
          ownerName,
          spaceId: gSpace,
          text,
          images: [],
          folderId: null,
          pinned: false,
          createdAt: ts,
          updatedAt: ts,
          hlc,
          deleted: false,
        },
      },
    ],
    token,
  );
}

/* ------------------------------ 截图 ------------------------------ */

const br = await chromium.launch();
const auth = JSON.stringify({ token: T, user: demo.user });

const makeCtx = async (w, h, dsf, mobile = false) => {
  const ctx = await br.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: dsf,
    isMobile: mobile,
    hasTouch: mobile,
  });
  await ctx.addInitScript((v) => localStorage.setItem('ssj:auth', v), auth);
  return ctx;
};

const open = async (page, path, wait = 1800) => {
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(wait);
};

/* 登录页（未登录） */
{
  const ctx = await br.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
  const p = await ctx.newPage();
  await open(p, '/login');
  await p.screenshot({ path: `${OUT}/screenshot-login.png` });
  await ctx.close();
}

const ctx = await makeCtx(1280, 800, 1.5);
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));

/* 记录页：滚到离底部一点，露出「最新」 */
await open(p, '/', 2400);
await p.evaluate(() => {
  const s = document.querySelector('.scroll');
  s.scrollTop = s.scrollHeight - s.clientHeight - 420;
});
await p.waitForTimeout(900);
await p.screenshot({ path: `${OUT}/screenshot-record.png` });

/* 时间线 */
await p.evaluate(() => localStorage.setItem('ssj:tab', 'timeline'));
await open(p, '/', 2200);
await p.screenshot({ path: `${OUT}/screenshot-timeline.png` });

/* 空间 */
await p.evaluate(() => localStorage.setItem('ssj:tab', 'space'));
await open(p, '/', 2200);
await p.screenshot({ path: `${OUT}/screenshot-space.png` });

/* 文件夹 */
await p.evaluate(() => localStorage.setItem('ssj:tab', 'folders'));
await open(p, '/', 2200);
await p.screenshot({ path: `${OUT}/screenshot-folders.png` });

/* 群空间 */
await p.evaluate(() => localStorage.setItem('ssj:tab', 'record'));
await open(p, '/', 2000);
await p.locator('.panel__item', { hasText: '露营小队' }).first().click();
await p.waitForTimeout(1600);
await p.screenshot({ path: `${OUT}/screenshot-group.png` });

/* 整理：跑一次，勾一条待办 */
await open(p, '/organize', 1600);
await p.locator('.btn--primary').first().click().catch(() => {});
await p.waitForTimeout(6000);
const todo = p.locator('.todo__box').first();
if (await todo.count()) {
  await todo.click();
  await p.waitForTimeout(600);
}
await p.evaluate(() => {
  const s = document.querySelector('.orgBody');
  if (s) s.scrollTop = 260;
});
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/screenshot-organize.png` });

/* 对话：问一句，等回答 */
await open(p, '/chat', 1600);
await p.locator('.chatInput').fill('我这周都记了什么？');
await p.keyboard.press('Enter');
await p.waitForTimeout(6500);
await p.screenshot({ path: `${OUT}/screenshot-chat.png` });

/* AI 配置面板 */
await p.locator('.engineTag').click();
await p.waitForTimeout(900);
await p.screenshot({ path: `${OUT}/screenshot-ai-config.png` });
await p.keyboard.press('Escape');
await p.waitForTimeout(400);

/* 我的（三栏结构） */
await open(p, '/account', 1800);
await p.screenshot({ path: `${OUT}/screenshot-layout.png` });

await ctx.close();

/* 手机：记录页 */
{
  const m = await makeCtx(390, 844, 2, true);
  const pm = await m.newPage();
  pm.on('pageerror', (e) => console.log('PAGEERROR-M', e.message));
  await open(pm, '/', 2600);
  await pm.evaluate(() => {
    const s = document.querySelector('.scroll');
    if (s) s.scrollTop = s.scrollHeight - s.clientHeight;
  });
  await pm.waitForTimeout(900);
  await pm.screenshot({ path: `${OUT}/screenshot-mobile.png` });
  await m.close();
}

await br.close();
console.log('done', fs.readdirSync(OUT).join(' '));
