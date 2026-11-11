/**
 * 桌面打包：把前端 dist + 打包后的服务端 + Electron 主进程拼成一个最小 app 目录，
 * 再交给 @electron/packager 生成免安装版本。
 *
 *   node scripts/pack-desktop.mjs [win32|linux|darwin]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const target = process.argv[2] || (process.platform === 'win32' ? 'win32' : process.platform);
const out = path.join(root, 'release');
const staging = path.join(root, 'build', 'desktop');

fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });

const copy = (from, to) => fs.cpSync(from, to, { recursive: true });
copy(path.join(root, 'dist'), path.join(staging, 'dist'));
copy(path.join(root, 'dist-server'), path.join(staging, 'dist-server'));
copy(path.join(root, 'electron', 'main.cjs'), path.join(staging, 'main.cjs'));

fs.writeFileSync(
  path.join(staging, 'package.json'),
  JSON.stringify(
    {
      name: 'suishouji',
      productName: 'Suishouji',
      version: pkg.version,
      main: 'main.cjs',
      author: 'Ysur007',
      license: 'MIT',
      description: 'Suishouji - note app',
    },
    null,
    2,
  ),
);

const electronVersion = JSON.parse(
  fs.readFileSync(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8'),
).version;

const bin = path.join(root, 'node_modules', '.bin', 'electron-packager');
execFileSync(
  bin,
  [
    staging,
    'Suishouji',
    `--platform=${target}`,
    '--arch=x64',
    `--out=${out}`,
    '--overwrite',
    `--app-version=${pkg.version}`,
    `--electron-version=${electronVersion}`,
  ],
  { stdio: 'inherit' },
);

console.log(`\n完成：${path.join(out, `Suishouji-${target}-x64`)}`);
