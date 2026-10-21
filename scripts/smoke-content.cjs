#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { root, routes, redirects, dependency } = require('./validate-content.cjs');
const { chromium } = dependency('playwright');

(async () => {
  let server, browser;
  const evidence = path.join(root, '.artifacts');
  fs.mkdirSync(evidence, { recursive: true });
  const baseFlag = process.argv.indexOf('--base');
  let base = baseFlag >= 0 ? process.argv[baseFlag + 1] : null;
  try {
    if (!base) {
      server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (redirects.has(url.pathname)) { res.writeHead(308, { Location: redirects.get(url.pathname) }); return res.end(); }
        const name = path.resolve(root, '.' + decodeURIComponent(url.pathname) + (url.pathname.endsWith('/') ? 'index.html' : ''));
        if (!name.startsWith(root + path.sep) || !fs.existsSync(name) || !fs.statSync(name).isFile()) { res.writeHead(404); return res.end(); }
        const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml' };
        res.writeHead(200, { 'Content-Type': mime[path.extname(name)] || 'text/plain' });
        fs.createReadStream(name).pipe(res);
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      base = 'http://127.0.0.1:' + server.address().port;
    }
    for (const route of routes) {
      const response = await fetch(base + route, { redirect: 'manual' });
      assert.equal(response.status, 200, route + ' did not serve directly');
      const html = await response.text();
      assert(html.includes('https://toolkitbox.org' + route), 'Missing canonical in response ' + route);
    }
    for (const [source, destination] of redirects) {
      const response = await fetch(base + source, { redirect: 'manual' });
      assert([301, 308].includes(response.status), source + ' not permanent');
      assert.equal(new URL(response.headers.get('location'), base).pathname, destination, source + ' wrong destination');
    }
    const missing = await fetch(base + '/guides/definitely-not-a-guide/', { redirect: 'manual' });
    assert.equal(missing.status, 404, 'Unknown route should be a real 404');
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const observations = [];
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      // Layout/control checks do not exercise live ads, analytics, or the provider CMP.
      await context.route('**/*', route => {
        const u = new URL(route.request().url());
        if (u.origin !== new URL(base).origin || u.pathname.startsWith('/_vercel/')) return route.abort();
        return route.continue();
      });
      const page = await context.newPage();
      for (const route of routes) {
        await page.goto(base + route, { waitUntil: 'load' });
        const dimensions = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
        assert(dimensions.scroll <= dimensions.client, route + ' overflow at ' + width + ': ' + JSON.stringify(dimensions));
        observations.push({ route, width, ...dimensions });
        if (['/testing/', '/zh/testing/'].includes(route)) {
          const table = page.locator('.table-scroll');
          await table.scrollIntoViewIfNeeded();
          if (width === 390) {
            await table.focus();
            await page.keyboard.press('End');
            await table.evaluate(el => { el.scrollLeft = el.scrollWidth; });
            assert(await table.evaluate(el => el.scrollLeft > 0), 'Table should remain horizontally usable');
          }
        }
        if (['/testing/', '/privacy/', '/guides/', '/zh/testing/'].includes(route)) {
          await page.screenshot({ path: path.join(evidence, route.replaceAll('/', '_') + width + '.png'), fullPage: true });
        }
      }
      await page.goto(base + '/privacy/');
      await page.locator('main .privacy-control-link').click();
      assert((await page.locator('[data-privacy-status]').textContent()).includes('No consent choice'));
      assert(page.url().endsWith('#privacy-choices'));
      await page.evaluate(() => { window.testRevocations = 0; window.googlefc = { showRevocationMessage() { window.testRevocations++; } }; });
      await page.locator('main .privacy-control-link').click();
      assert.equal(await page.evaluate(() => window.testRevocations), 1);
      await context.close();
    }
    const noJS = await browser.newContext({ javaScriptEnabled: false });
    const page = await noJS.newPage();
    await page.goto(base + '/guides/');
    await page.locator('[data-privacy-settings]').click();
    assert(page.url().endsWith('/privacy/#privacy-choices'));
    assert(await page.locator('a[href="https://myadcenter.google.com/"]').isVisible());
    await noJS.close();
    const result = { base, browser: await browser.version(), pages: routes.length, redirectRules: redirects.size, observations, privacyControls: 'fallback, mocked provider, no-JS navigation passed', excluded: 'External advertising, analytics, real CMP, and tool subdomains' };
    fs.writeFileSync(path.join(evidence, 'content-smoke.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ ...result, observations: observations.length }, null, 2));
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
