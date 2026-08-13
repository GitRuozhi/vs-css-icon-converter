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
.icon-plus { position: relative; width: 16px; height: 16px; box-sizing: border-box; }
.icon-plus::before, .icon-plus::after { content: ""; position: absolute; inset: 0; margin: auto; width: 12px; height: 0px; border-top: 4px solid currentColor; transform-origin: center center; }
.icon-plus::after { transform: rotate(90deg); }
.icon-frame { position: relative; width: 16px; height: 16px; }
.icon-frame::before { content: ""; position: absolute; inset: 0; margin: auto; width: 16px; height: 16px; background: linear-gradient(currentColor 0 0) 0px 0px / 2px 6px no-repeat, linear-gradient(currentColor 0 0) 14px 0px / 2px 6px no-repeat; }
.icon-fullscreen { position: relative; width: 16px; height: 16px; }
.icon-fullscreen > .corner-a::before, .icon-fullscreen > .corner-a::after, .icon-fullscreen > .corner-b::before, .icon-fullscreen > .corner-b::after { content: ""; position: absolute; width: 8px; height: 8px; background: currentColor; clip-path: polygon(25% 50%, 50% 75%, 75% 50%, 50% 25%, 75% 0%, 0% 0%, 0% 75%); }
.icon-fullscreen > .corner-a::before { left: 0px; top: 0px; }
.icon-fullscreen > .corner-a::after { right: 0px; top: 0px; transform: rotate(90deg); }
.icon-fullscreen > .corner-b::before { right: 0px; bottom: 0px; transform: rotate(180deg); }
.icon-fullscreen > .corner-b::after { left: 0px; bottom: 0px; transform: rotate(270deg); }
.icon-dotted { position: relative; width: 16px; height: 16px; }
.icon-dotted::before { content: ""; position: absolute; left: 0px; bottom: 2px; width: 8px; height: 6px; border: 2px dotted currentColor; }
.icon-solid { position: relative; width: 16px; height: 16px; }
.icon-solid::before { content: ""; position: absolute; left: 0px; bottom: 2px; width: 12px; height: 10px; border: 2px solid currentColor; }
.icon-root-border { position: relative; width: 16px; height: 16px; border: 2px solid currentColor; }
.icon-transform { position: relative; width: 16px; height: 16px; }
.icon-transform::before { content: ""; position: absolute; right: 0px; top: 0px; width: 14px; height: 6px; background: currentColor; clip-path: polygon(0% 67%, 0% 100%, 100% 100%, 50% 0%, 50% 67%); transform: scaleX(-1); }
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

const fullscreen = await run('fullscreen');
assert.equal(fullscreen.code, 0);
assert.equal(fullscreen.report.status, 'converted');
assert.equal(fullscreen.report.shapeCount, 4);

const dotted = await run('dotted');
assert.equal(dotted.code, 0);
assert.equal(dotted.report.status, 'converted');
assert.match(dotted.svg, /stroke-dasharray="2 2"/);

const solid = await run('solid');
assert.equal(solid.code, 0);
assert.equal(solid.report.status, 'converted');
assert.equal(solid.report.shapeCount, 1);
assert.match(solid.svg, /stroke="currentColor"/);

const transform = await run('transform');
assert.equal(transform.code, 0);
assert.equal(transform.report.status, 'converted');
assert.match(transform.svg, /points="16,4\.02 16,6 2,6 9,0 9,4\.02"/);

const rootBorder = await run('root-border');
assert.equal(rootBorder.code, 0);
assert.equal(rootBorder.report.status, 'converted');
assert.match(rootBorder.svg, /x="1" y="1" width="14" height="14"/);

const unknown = await run('unknown');
assert.equal(unknown.code, 2);
assert.equal(unknown.report.status, 'manual-review');
assert.ok(unknown.report.warnings.some((warning) => warning.includes('filter')));

console.log('All converter tests passed.');
