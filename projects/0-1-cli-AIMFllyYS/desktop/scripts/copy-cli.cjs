const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const rootDist = path.resolve(__dirname, '..', '..', 'dist');
const rootPackage = path.resolve(__dirname, '..', '..', 'package.json');
const target = path.resolve(__dirname, '..', 'dist', 'cli');

if (!fs.existsSync(path.join(rootDist, 'index.js'))) {
  throw new Error('Root CLI dist/index.js is missing. Run npm run build first.');
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.cpSync(rootDist, target, { recursive: true });

const pkg = JSON.parse(fs.readFileSync(rootPackage, 'utf8'));
fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({
  name: '0-1-cli-runtime',
  private: true,
  type: 'commonjs',
  dependencies: pkg.dependencies || {},
}, null, 2), 'utf8');

execSync('npm install --omit=dev --ignore-scripts', {
  cwd: target,
  stdio: 'inherit',
});

const runtimeIndex = path.join(target, 'index.js');
const runtimeChalk = path.join(target, 'node_modules', 'chalk');
if (!fs.existsSync(runtimeIndex)) {
  throw new Error('Bundled CLI runtime index.js is missing after copy.');
}
if (!fs.existsSync(runtimeChalk)) {
  throw new Error('Bundled CLI runtime dependencies are missing after npm install.');
}
