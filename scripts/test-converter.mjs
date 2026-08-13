import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cli = path.join(root, 'scripts', 'convert-icons.mjs');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'vs-css-icon-converter-'));
const css = path.join(temp, 'icons.css');
await fs.writeFile(css, `
.icon-plus { position: relative; width: 16px; height: 16px; }
.icon-plus::before, .icon-plus::after { content: ""; position: absolute; inset: 0; margin: auto; width: 12px; height: 0px; border-top: 4px solid currentColor; transform-origin: center center; }
.icon-plus::after { transform: rotate(90deg); }
.icon-frame { position: relative; width: 16px; height: 16px; }
.icon-frame::before { content: ""; position: absolute; inset: 0; margin: auto; width: 16px; height: 16px; background: linear-gradient(currentColor 0 0) 0px 0px / 2px 6px no-repeat, linear-gradient(currentColor 0 0) 14px 0px / 2px 6px no-repeat; }
.icon-unknown::before { content: ""; position: absolute; width: 16px; height: 16px; filter: blur(1px); }
`, 'utf8');

function run(icon) {
  return new Promise((resolve, reject) => {
    const output = path.join(temp, `${icon}.svg`);
    const report = path.join(temp, `${icon}.json`);
    const child = spawn(process.execPath, [cli, '--css', css, '--icon', icon, '--output', output, '--report', report], { cwd: root, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', async (code) => {
      if (code === 1) reject(new Error(stderr || stdout));
      else resolve({ code, svg: await fs.readFile(output, 'utf8'), report: JSON.parse(await fs.readFile(report, 'utf8')) });
    });
  });
}

const plus = await run('plus');
assert.equal(plus.code, 0);
assert.equal(plus.report.status, 'converted');
assert.match(plus.svg, /<polygon points="2,6 14,6 14,10 2,10" \/>/);
assert.match(plus.svg, /<polygon points="10,2 10,14 6,14 6,2" \/>/);

const frame = await run('frame');
assert.equal(frame.code, 0);
assert.equal(frame.report.status, 'converted');
assert.equal(frame.report.shapeCount, 2);

const unknown = await run('unknown');
assert.equal(unknown.code, 2);
assert.equal(unknown.report.status, 'manual-review');
assert.ok(unknown.report.warnings.some((warning) => warning.includes('filter')));

console.log('All converter tests passed.');
