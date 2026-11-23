// 首页交互回归：把页面上每个按钮、链接都用真实鼠标点一遍，检查结果对不对。
// 用法：npm i playwright-core@1.48.2 && CHROME=/path/to/chrome node tests/ui-check.js [页面地址]
// 默认测本地 index.html；传 https://xiaoliang.tech/ 就测线上。
const { chromium } = require('playwright-core');
const path = require('path');

const URL = process.argv[2] || 'file://' + path.resolve(__dirname, '../index.html');
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const results = [];
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? '✓' : '✗'} ${name}${info ? '  ' + info : ''}`); };

async function settle(p) {   // 等 Lenis 平滑滚动停下来
  let last = -1;
  for (let i = 0; i < 60; i++) { const y = await p.evaluate(() => Math.round(scrollY)); if (y === last) return; last = y; await p.waitForTimeout(120); }
}
async function goTo(p, sel, offset = 120) {
  await p.evaluate(([sel, offset]) => { const el = document.querySelector(sel); const y = el.getBoundingClientRect().top + scrollY - offset; window.__lenis ? window.__lenis.scrollTo(y, { immediate: true }) : scrollTo(0, y); }, [sel, offset]);
  await settle(p);
}
async function realClick(p, locator) {   // 真实鼠标：移过去、按下、松开
  const bb = await locator.boundingBox();
  if (!bb) throw new Error('元素不可见');
  const x = bb.x + bb.width / 2, y = bb.y + bb.height / 2;
  await p.mouse.move(x, y, { steps: 8 }); await p.waitForTimeout(120);
  const hit = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.outerHTML.slice(0, 60), [x, y]);
  await p.mouse.down(); await p.waitForTimeout(60); await p.mouse.up();
  return hit;
}

async function desktop(b) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(800);

  // 1. 顶部导航
  for (const id of ['work', 'study', 'writing', 'contact']) {
    await realClick(p, p.locator(`header nav a[href="#${id}"]`)); await p.waitForTimeout(1600); await settle(p);
    const top = await p.evaluate(id => Math.round(document.getElementById(id).getBoundingClientRect().top), id);
    ok(`导航「${id}」跳到对应区块`, Math.abs(top) < 140, `区块顶部=${top}px`);
  }
  await goTo(p, '#top', 0);
  // 2. 首屏圆形徽章 ↓
  await p.waitForTimeout(600);
  await realClick(p, p.locator('#badge .core')); await p.waitForTimeout(1600); await settle(p);   // 点中心红点，不是外圈
  ok('首屏 ↓（中心红点）跳到作品区', Math.abs(await p.evaluate(() => document.getElementById('work').getBoundingClientRect().top)) < 140);

  // 3. 路标筛选
  await goTo(p, '#scene', 80);
  for (const k of ['应用', 'MCP', 'Agent', '技能', '全部']) {
    const sign = p.locator(`.sign[data-k="${k}"]`);
    const want = Number(await sign.locator('small').textContent());
    let shown = -1;
    for (let tries = 0; tries < 3 && shown !== want; tries++) {   // 路标会跟着鼠标转，点完再数
      await realClick(p, sign); await p.waitForTimeout(300);
      shown = await p.evaluate(() => [...document.querySelectorAll('.card')].filter(c => !c.classList.contains('hide')).length);
    }
    ok(`路标「${k}」筛出 ${want} 个作品`, shown === want, `实际 ${shown}`);
  }
  // 4. 作品卡片：每张都能点到自己，有链接的链接正确
  const cards = await p.locator('.card').count();
  let cardBad = [];
  for (let i = 0; i < cards; i++) {
    const c = p.locator('.card').nth(i);
    await c.scrollIntoViewIfNeeded(); await settle(p);
    const bb = await c.boundingBox();
    const inside = await p.evaluate(([x, y, i]) => document.querySelectorAll('.card')[i].contains(document.elementFromPoint(x, y)), [bb.x + bb.width / 2, bb.y + bb.height / 2, i]);
    const href = await c.getAttribute('href');
    if (!inside) cardBad.push(i + ':被遮挡');
    if (href && !/^https:\/\/github\.com\/bmdy6\//.test(href)) cardBad.push(i + ':链接异常');
  }
  ok(`作品卡片 ${cards} 张都能点到`, cardBad.length === 0, cardBad.join(' '));

  // 5. 书房：8 本书逐本打开、翻到最后一页、翻回来、合上
  await goTo(p, '#desk', 100);
  const books = await p.locator('.nb').count();
  for (let i = 0; i < books; i++) {
    const nb = p.locator('.nb').nth(i);
    await realClick(p, nb); await p.waitForTimeout(1100);
    const open = await p.evaluate(() => document.getElementById('reader').classList.contains('shown'));
    const name = (await nb.locator('h4').textContent()).trim();
    const title = open ? (await p.locator('#lp h3').textContent()).trim() : '';
    let pages = 0, total = 0, fwd = true, back = true;
    if (open) {
      total = Number((await p.locator('.pager span').textContent()).split('/')[1]);
      for (let k = 1; k < total; k++) { await realClick(p, p.locator('#next')); await p.waitForTimeout(850); }
      pages = Number((await p.locator('.pager span').textContent()).split('/')[0]);
      fwd = pages === total && await p.locator('#next').isDisabled();
      for (let k = 1; k < total; k++) { await realClick(p, p.locator('#prev')); await p.waitForTimeout(850); }
      back = (await p.locator('.pager span').textContent()).trim().startsWith('1') && await p.locator('#prev').isDisabled();
      const go = await p.locator('#lp .go').getAttribute('href');
      ok(`  「${name}」打开这本书链接`, /^https:\/\/plan\.xiaoliang\.tech\//.test(go), go);
    }
    ok(`书 ${i + 1}「${name}」打开 / 翻到第 ${total} 页 / 翻回 / 标题对`, open && fwd && back && title === name, `翻到=${pages}`);
    // 合上：三种方式轮流测
    const how = ['按钮', 'Esc', '点空白'][i % 3];
    if (how === '按钮') await realClick(p, p.locator('#closeb'));
    if (how === 'Esc') await p.keyboard.press('Escape');
    if (how === '点空白') { await p.mouse.move(30, 450, { steps: 5 }); await p.mouse.down(); await p.mouse.up(); }
    await p.waitForTimeout(1100);
    const closed = await p.evaluate(i => !document.getElementById('reader').classList.contains('open') && document.querySelectorAll('.nb')[i].style.visibility === '', i);
    ok(`  合上（${how}）后书回到桌上`, closed);
  }
  // 键盘左右翻页
  await realClick(p, p.locator('.nb').nth(0)); await p.waitForTimeout(1100);
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(850);
  const kr = (await p.locator('.pager span').textContent()).trim();
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(850);
  const kl = (await p.locator('.pager span').textContent()).trim();
  ok('键盘 → / ← 翻页', kr.startsWith('2') && kl.startsWith('1'), `${kr} → ${kl}`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(900);
  // 拖动笔记本：会移动、不会打开
  const nb0 = p.locator('.nb').nth(3), before = await nb0.boundingBox();
  await p.mouse.move(before.x + 40, before.y + 40, { steps: 5 }); await p.mouse.down();
  await p.mouse.move(before.x + 160, before.y + 90, { steps: 12 }); await p.mouse.up(); await p.waitForTimeout(500);
  const after = await nb0.boundingBox(), opened = await p.evaluate(() => document.getElementById('reader').classList.contains('open'));
  ok('拖动笔记本会移动、不会误打开', Math.abs(after.x - before.x) > 60 && !opened, `移动 ${Math.round(after.x - before.x)}px`);

  // 6. 文章列表
  await goTo(p, '#posts', 200);
  const posts = await p.locator('#posts a').count();
  let postBad = 0;
  for (let i = 0; i < posts; i++) {
    const a = p.locator('#posts a').nth(i), bb = await a.boundingBox();
    const inside = await p.evaluate(([x, y, i]) => document.querySelectorAll('#posts a')[i].contains(document.elementFromPoint(x, y)), [bb.x + 60, bb.y + bb.height / 2, i]);
    if (!inside || !/^https:\/\//.test(await a.getAttribute('href'))) postBad++;
  }
  ok(`文章 ${posts} 条都能点到、链接正确`, posts > 0 && postBad === 0);

  // 7. 联系区按钮
  await goTo(p, '#contact', 0);
  for (const txt of ['GitHub', '知识书房']) {
    const a = p.locator('.contact .links a', { hasText: txt });
    const bb = await a.boundingBox();
    await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 8 }); await p.waitForTimeout(200);   // 磁吸会把按钮往鼠标拉
    const bb2 = await a.boundingBox();
    const inside = await p.evaluate(([x, y, t]) => [...document.querySelectorAll('.contact .links a')].find(a => a.textContent.includes(t)).contains(document.elementFromPoint(x, y)), [bb.x + bb.width / 2, bb.y + bb.height / 2, txt]);
    ok(`联系区「${txt}」按钮磁吸后仍能点到`, inside, `按钮位移 ${Math.round(bb2.x - bb.x)},${Math.round(bb2.y - bb.y)}`);
  }
  await p.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await realClick(p, p.locator('#wx')); await p.waitForTimeout(300);
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  const tip = await p.locator('#wxTip').textContent();
  ok('联系区「微信」点击复制微信号', clip === 'bmdyxl' && tip.includes('已复制'), `剪贴板=${clip} 提示=${tip}`);
  ok('桌面端无 JS 报错', errs.length === 0, errs.join(' | '));

  // 8. 所有外链状态
  const links = await p.evaluate(() => {
    const s = new Set([...document.querySelectorAll('a[href^="http"]')].map(a => a.href));
    return [...s];
  });
  await p.close();
  return links;
}

async function mobile(b) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(800);
  await goTo(p, '#scene', 80);
  await p.locator('.sign[data-k="MCP"]').tap({ force: true }); await p.waitForTimeout(300);
  const shown = await p.evaluate(() => [...document.querySelectorAll('.card')].filter(c => !c.classList.contains('hide')).length);
  ok('手机：点路标 MCP 筛选', shown === 4, `实际 ${shown}`);
  await p.locator('.sign[data-k="全部"]').tap({ force: true });
  await goTo(p, '#desk', 80);
  await p.locator('.nb').nth(1).tap(); await p.waitForTimeout(1100);
  const open = await p.evaluate(() => document.getElementById('reader').classList.contains('shown'));
  if (open) { await p.locator('#next').tap(); await p.waitForTimeout(500); }
  const pg = open ? (await p.locator('.pager span').textContent()).trim() : '';
  ok('手机：点笔记本打开、下一页', open && pg.startsWith('2'), pg);
  if (open) { await p.locator('#closeb').tap(); await p.waitForTimeout(1100); }
  ok('手机：合上', !(await p.evaluate(() => document.getElementById('reader').classList.contains('open'))));
  ok('手机：无横向滚动', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  ok('手机端无 JS 报错', errs.length === 0, errs.join(' | '));
  await p.close();
}

(async () => {
  const b = await chromium.launch({ executablePath: CHROME });
  const links = await desktop(b);
  await mobile(b);
  await b.close();
  // 外链：并发 GET，只看状态码
  const bad = [];
  await Promise.all(links.map(async u => {
    for (let t = 0; t < 2; t++) {   // 并发时偶尔超时，失败重试一次
      try { const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(25000) }); if (r.status < 400) return; if (t) bad.push(`${r.status} ${u}`); }
      catch (e) { if (t) bad.push(`ERR ${u}`); }
    }
  }));
  ok(`页面外链 ${links.length} 个都能打开`, bad.length === 0, bad.join('\n    '));
  const fail = results.filter(r => !r.pass).length;
  console.log(`\n共 ${results.length} 项，失败 ${fail} 项`);
  process.exit(fail ? 1 : 0);
})();
