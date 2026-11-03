const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const workspace = path.resolve(root, '..');
const check = process.argv.includes('--check');
const source = fs.readFileSync(path.join(root, 'privacy-controls.js'));
for (const app of ['json-toolbox', 'base64-tool', 'uuid-generator', 'color-tool', 'regex-tester', 'diff-checker', 'url-checker', 'ssl-checker']) {
  const target = path.join(workspace, app, 'privacy-controls.js');
  if (check) {
    if (!fs.existsSync(target) || !source.equals(fs.readFileSync(target))) throw new Error(`Out-of-date privacy asset: ${target}`);
  } else fs.writeFileSync(target, source);
}
console.log(check ? 'Tool privacy assets match source.' : 'Tool privacy assets synchronized.');
