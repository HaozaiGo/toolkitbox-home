#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(process.argv[2] || ".");
const removeLoader = process.argv.includes("--remove-loader-from-policy-pages");
const tracked = execFileSync("git", ["ls-files", "*.html"], {
  cwd: root,
  encoding: "utf8",
}).trim().split("\n").filter(Boolean);

const lowIntentPage = /(^|\/)(about|contact|privacy|terms|editorial-policy|changelog)\/index\.html$|(^|\/)guides\/index\.html$/;
const loader = /\s*<script async src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-5333037258750046"\s*(?:crossorigin="anonymous")?><\/script>/g;

for (const relative of tracked) {
  const file = path.join(root, relative);
  let html = fs.readFileSync(file, "utf8");

  if (!html.includes('name="google-adsense-account"')) {
    html = html.replace(
      /(<meta name="robots"[^>]*>)/,
      '$1\n  <meta name="google-adsense-account" content="ca-pub-5333037258750046">',
    );
  }

  if (removeLoader && lowIntentPage.test(relative)) {
    html = html.replace(loader, "");
  }

  fs.writeFileSync(file, html);
}

console.log(`Normalized AdSense metadata in ${tracked.length} HTML files under ${root}`);
