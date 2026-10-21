#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function dependency(name) {
  try { return require(name); } catch {
    const bin = process.env.PATH.split(path.delimiter).find(p => p.includes('_npx') && p.endsWith('node_modules/.bin'));
    if (!bin) throw new Error('Run with the pinned npm exec command in README.md');
    return require(path.join(bin, '..', name));
  }
}
const { parseHTML, DOMParser } = dependency('linkedom');
const root = path.resolve(__dirname, '..');
const origin = 'https://toolkitbox.org';
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const config = JSON.parse(read('vercel.json'));
const redirects = new Map(config.redirects.filter(r => !r.has).map(r => [r.source, r.destination]));
const sitemap = new DOMParser().parseFromString(read('sitemap.xml'), 'text/xml');
const urls = [...sitemap.querySelectorAll('loc')].map(el => el.textContent);
const routes = urls.map(url => new URL(url).pathname);
assert.equal(new Set(routes).size, routes.length, 'Duplicate sitemap entries');
assert.equal(sitemap.querySelectorAll('lastmod').length, 0, 'Dates require explicit significant-change evidence');
const docs = new Map(routes.map(route => [route, parseHTML(read(route.slice(1) + 'index.html')).document]));
const sourceRoutes = [];
function discover(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) discover(full);
    else if (entry.name === 'index.html') sourceRoutes.push('/' + path.relative(root, full).replace(/index\.html$/, ''));
  }
}
discover(root);
assert.deepEqual(sourceRoutes.filter(route => !redirects.has(route)).sort(), [...routes].sort(), 'Canonical pages missing from sitemap');
for (const slug of ['uuid-generator-guide', 'color-conversion-accessibility', 'text-diff-workflow', 'url-encoding-decoding']) {
  assert(docs.has('/guides/' + slug + '/'), 'Distinct useful topic must remain available');
}
const links = new Map();
for (const [route, doc] of docs) {
  assert(!redirects.has(route), 'Sitemap contains retired URL: ' + route);
  assert.equal(doc.querySelector('link[rel=canonical]').getAttribute('href'), origin + route);
  assert.equal(doc.querySelectorAll('h1').length, 1, route + ' must have one H1');
  assert(doc.querySelector('title').textContent.trim());
  assert(doc.querySelector('meta[name=description]').getAttribute('content').trim());
  assert(!/noindex/i.test(doc.querySelector('meta[name=robots]').getAttribute('content')));
  assert.equal(doc.documentElement.lang, route.startsWith('/zh/') ? 'zh-CN' : 'en');
  const english = route.replace(/^\/zh\//, '/');
  for (const [lang, target] of [['en', english], ['zh-CN', '/zh' + english], ['x-default', english]]) {
    assert.equal(doc.querySelector('link[hreflang="' + lang + '"]').getAttribute('href'), origin + target, route + ' alternate');
    assert(docs.has(target), 'Missing translation ' + target);
  }
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    const data = JSON.parse(script.textContent);
    const article = (data['@graph'] || [data]).find(item => item['@type'] === 'Article');
    if (article && !route.startsWith('/zh/')) {
      const translated = [...docs.get('/zh' + route).querySelectorAll('script[type="application/ld+json"]')]
        .flatMap(el => { const data = JSON.parse(el.textContent); return data['@graph'] || [data]; })
        .find(item => item['@type'] === 'Article');
      assert.equal(article.dateModified, translated.dateModified, 'Bilingual modification-date mismatch ' + route);
    }
  }
  assert(doc.querySelector('script[src="/privacy-controls.js"]'), route + ' lacks privacy adapter');
  const controls = [...doc.querySelectorAll('[data-privacy-settings]')];
  assert(controls.length > 0, route + ' lacks privacy link');
  for (const control of controls) {
    assert(!control.hasAttribute('hidden'), route + ' hides privacy choices');
    assert(control.getAttribute('href').endsWith('#privacy-choices'));
  }
  const edges = [];
  for (const a of doc.querySelectorAll('a[href]')) {
    const url = new URL(a.getAttribute('href'), origin + route);
    if (url.origin !== origin) continue;
    assert(!redirects.has(url.pathname), route + ' links to retired ' + url.pathname);
    const target = docs.get(url.pathname);
    assert(target, route + ' links to missing ' + url.pathname);
    if (url.hash) assert(target.getElementById(decodeURIComponent(url.hash.slice(1))), 'Missing fragment ' + url.href);
    edges.push(url.pathname);
  }
  for (const asset of doc.querySelectorAll('img[src], script[src], link[rel=stylesheet]')) {
    const src = asset.getAttribute('src') || asset.getAttribute('href');
    if (src.startsWith('/') && !src.startsWith('/_vercel/')) assert(fs.existsSync(path.join(root, src)), 'Missing asset ' + src);
  }
  links.set(route, edges);
}
const seen = new Set();
const visit = route => { if (seen.has(route)) return; seen.add(route); for (const target of links.get(route) || []) visit(target); };
visit('/');
assert.deepEqual([...docs.keys()].filter(route => !seen.has(route)), [], 'Orphan canonical pages');
for (const [source, destination] of redirects) {
  assert(docs.has(destination), 'Redirect target is not canonical: ' + destination);
  assert(!destination.endsWith('/testing/'), 'Unrelated testing redirect');
  assert.equal(source.startsWith('/zh/'), destination.startsWith('/zh/'), 'Redirect changes language');
  if (!source.startsWith('/zh/')) assert.equal(redirects.get('/zh' + source), '/zh' + destination);
  if (source.endsWith('/')) assert.equal(redirects.get(source + 'index.html'), destination, 'Retired HTML alias remains reachable');
}
const guidePaths = [...docs.keys()].filter(p => /^\/guides\/[^/]+\/$/.test(p));
for (const route of guidePaths) {
  assert(links.get('/guides/').includes(route), 'Guide absent from index ' + route);
  assert(links.get('/zh/guides/').includes('/zh' + route));
}
for (const route of ['/privacy/', '/zh/privacy/']) {
  const doc = docs.get(route);
  assert(!doc.querySelector('script[src*="adsbygoogle"]'));
  assert(doc.querySelector('[data-privacy-status][role=status]'));
  assert(doc.querySelector('a[href="https://myadcenter.google.com/"]'));
}

// The provider is mocked only to test dispatch/fallback, never to assert real CMP availability.
const adapter = read('privacy-controls.js');
for (const language of ['en', 'zh-CN']) {
  let listener;
  const status = { textContent: '' };
  const document = { documentElement: { lang: language }, addEventListener: (_, cb) => { listener = cb; }, querySelector: () => status };
  const window = {};
  vm.runInNewContext(adapter, { document, window });
  const click = overrides => {
    let prevented = false;
    listener({ target: { closest: () => ({}) }, button: 0, preventDefault: () => { prevented = true; }, ...overrides });
    return prevented;
  };
  assert.equal(click(), false, 'Missing CMP must preserve normal link navigation');
  assert(status.textContent.includes(language === 'en' ? 'No consent choice' : '未更改'));
  let calls = 0;
  window.googlefc = { showRevocationMessage() { calls++; } };
  assert.equal(click(), true, 'Late provider must be callable');
  assert.equal(calls, 1);
  assert.equal(click({ ctrlKey: true }), false, 'Modified clicks keep browser behavior');
  assert.equal(calls, 1);
  window.googlefc.showRevocationMessage = () => { throw Error('blocked'); };
  assert.equal(click(), false, 'Provider errors preserve fallback');
}
const sample = new URL('https://example.com/search');
sample.searchParams.set('q', 'C++ & tea');
sample.searchParams.append('tag', 'one');
sample.searchParams.append('tag', 'two');
assert.equal(sample.search, '?q=C%2B%2B+%26+tea&tag=one&tag=two');
assert.deepEqual(sample.searchParams.getAll('tag'), ['one', 'two']);
assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test('550e8400-e29b-41d4-a716-446655440000'));
const contrast = value => { const s = value / 255; const l = s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; return 1.05 / (l + 0.05); };
assert(contrast(0x77) < 4.5 && contrast(0x76) > 4.5);
console.log(JSON.stringify({ canonicalPages: docs.size, guidesPerLanguage: guidePaths.length, redirectRules: redirects.size, orphanPages: 0, privacyFallbacks: 'passed', referenceExamples: 'passed' }, null, 2));
module.exports = { root, routes, redirects, dependency };
