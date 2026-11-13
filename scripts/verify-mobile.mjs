/**
 * 手机端交互回归：文件夹返回 / 长按菜单 / 纯图片多选。
 *
 * 起一个干净实例：
 *   PORT=9452 DATA_DIR=/tmp/data-verify npx tsx server/index.ts
 * 跑：
 *   PW=/path/to/playwright-core CHROME=/path/to/chrome node scripts/verify-mobile.mjs
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright-core');

const BASE = process.env.BASE || 'http://127.0.0.1:9452';
const SHOT = process.env.SHOT || 'docs/screenshot-record.png';

const out = [];
const check = (name, ok, extra = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  → ' + extra : ''}`;
  out.push(line);
  console.log(line);
};

const browser = await chromium.launch({
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
  args: ['--no-sandbox'],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log(`PAGEERROR ${e.message}`));

const longPress = async (locator, ms = 620) => {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
  await page.waitForTimeout(320);
};

try {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.composer__input', { timeout: 20000 });

  /* ---------- 造三条消息：文字 1 条 + 纯图片 2 条 ---------- */
  await page.fill('.composer__input', '回归测试·文字消息');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);

  for (let i = 0; i < 2; i += 1) {
    await page.locator('input[type=file]').setInputFiles(SHOT);
    await page.waitForTimeout(700);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
  }

  const bubbleCount = await page.locator('.bubble').count();
  const mediaCount = await page.locator('.bubble--media').count();
  check('三条消息（1 文字 + 2 纯图）', bubbleCount >= 3 && mediaCount >= 2, `bubble=${bubbleCount} media=${mediaCount}`);

  /* ---------- A. 长按：直接出菜单、不留选区 ---------- */
  await longPress(page.locator('.bubble').first());
  check('长按弹出菜单', await page.locator('.menu').isVisible());
  check('长按后没有选区', (await page.evaluate(() => window.getSelection()?.toString() || '')) === '');
  const us = await page.evaluate(() => getComputedStyle(document.querySelector('.bubble')).userSelect);
  check('触屏气泡 user-select=none', us === 'none', us);
  await page.locator('.scrim').click({ force: true });
  await page.waitForTimeout(250);

  /* ---------- B. 新建文件夹 → 空间页 → 回文件夹页 → 进文件夹 → TabBar 回记录 ---------- */
  await page.click('button[aria-label="文件夹"]');
  await page.waitForTimeout(600);
  check('进入文件夹页', await page.locator('.folder-tile').first().isVisible());

  await page.click('.folder-tile--new');
  await page.waitForTimeout(600);
  await page.fill('.field__input', '回归文件夹');
  await page.click('.btn--primary:has-text("创建")');
  await page.waitForTimeout(1000);
  check('新建后进入空间页', await page.locator('.space-tools').isVisible());

  await page.click('.text-btn:has-text("文件夹")');
  await page.waitForTimeout(700);
  const tile = page.locator('.folder-tile:not(.folder-tile--new)').first();
  check('文件夹页出现卡片', await tile.isVisible());
  await tile.click();
  await page.waitForTimeout(800);
  check('点文件夹进入空间页', await page.locator('.space-tools').isVisible());

  await page.locator('.tabbar__item').first().click();
  await page.waitForTimeout(900);
  check('底部「记录」能回到记录页', await page.locator('.composer__input').isVisible());
  check('底部「记录」高亮正确', (await page.locator('.tabbar__item[data-active="true"]').count()) === 1);

  /* ---------- C. 纯图片消息：长按 → 多选 → 点图勾选 ---------- */
  await longPress(page.locator('.bubble--media').first());
  check('纯图片气泡长按出菜单', await page.locator('.menu').isVisible());
  const lightboxOpen = await page.locator('.lightbox').count();
  check('长按图片没有顺手开预览', lightboxOpen === 0);

  await page.locator('.menu__item:has-text("多选")').click();
  await page.waitForTimeout(600);
  check('从菜单进入多选', await page.locator('.selBar').isVisible());

  await page.locator('.bubble--media').nth(1).locator('.bubble__img').first().click({ force: true });
  await page.waitForTimeout(400);
  const countText = (await page.locator('.selBar__count').innerText()).replace(/\s+/g, ' ').trim();
  check('纯图片消息可以勾选', countText.includes('2'), countText);

  /* ---------- D. 返回键的事件通路 ---------- */
  await page.evaluate(() => window.dispatchEvent(new Event('ssj:exit-select')));
  await page.waitForTimeout(400);
  check('exit-select 退出多选', (await page.locator('.selBar').count()) === 0);
  check('退出多选后回到输入框', await page.locator('.composer__input').isVisible());

  await page.screenshot({ path: '/tmp/verify-mobile.png' });
} catch (err) {
  await page.screenshot({ path: '/tmp/verify-fail.png' }).catch(() => {});
  console.log('FAILED:', err.message);
} finally {
  console.log('\n--- 汇总 ---');
  console.log(out.join('\n'));
  const failed = out.filter((l) => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - failed}/${out.length} 通过`);
  await browser.close();
}
