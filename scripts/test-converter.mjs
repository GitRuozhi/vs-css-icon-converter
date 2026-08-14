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
* { box-sizing: border-box; }
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
.icon-screenshot { position: relative; top: 2px; width: 16px; height: 12px; border: 1px solid currentColor; }
.icon-screenshot::before { content: ""; position: absolute; top: -4px; right: 3px; width: 6px; height: 2px; border: 1px solid currentColor; }
.icon-screenshot::after { content: ""; position: absolute; inset: 0; margin: auto; width: 6px; height: 6px; border: 1px solid currentColor; border-radius: 50%; }
.icon-relative { position: relative; top: 2px; width: 18px; height: 12px; border: 2px solid currentColor; }
.icon-solid { position: relative; width: 16px; height: 16px; }
.icon-solid::before { content: ""; position: absolute; left: 0px; bottom: 2px; width: 12px; height: 10px; border: 2px solid currentColor; }
.icon-root-border { position: relative; width: 16px; height: 16px; border: 2px solid currentColor; }
.icon-prefix, .icon-prefix-wide { position: relative; width: 16px; height: 16px; }
.icon-prefix::before { content: ""; position: absolute; left: 0; top: 0; width: 4px; height: 4px; background: currentColor; }
.icon-prefix-wide::before { content: ""; position: absolute; left: 0; top: 0; width: 8px; height: 4px; background: currentColor; }
.icon-mirror { position: relative; width: 16px; height: 16px; }
.icon-mirror::before { content: ""; position: absolute; inset: 0; margin: auto; width: 0; height: 0; border-left: 3px solid currentColor; border-right: 3px solid currentColor; border-top: 3px solid transparent; border-bottom: 3px solid transparent; }
.icon-rounded { position: relative; width: 16px; height: 16px; }
.icon-rounded::before { content: ""; position: absolute; left: 2px; top: 2px; width: 8px; height: 4px; border: 2px solid currentColor; border-radius: 2px; }
.icon-checkbox { position: relative; width: 16px; height: 16px; }
.icon-checkbox::before { content: ""; position: absolute; inset: 0; margin: auto; width: 10px; height: 10px; border: 2px solid currentColor; }
.icon-checkbox.checked::after { content: ""; position: absolute; inset: 0; margin: auto; width: 6px; height: 6px; background: currentColor; }
.icon-rotated-border { position: relative; width: 16px; height: 16px; }
.icon-rotated-border::before { content: ""; position: absolute; left: 4px; top: 5px; width: 8px; height: 4px; border: 1px solid currentColor; transform: rotate(90deg); }
.icon-transform { position: relative; width: 16px; height: 16px; }
.icon-transform::before { content: ""; position: absolute; right: 0px; top: 0px; width: 14px; height: 6px; background: currentColor; clip-path: polygon(0% 67%, 0% 100%, 100% 100%, 50% 0%, 50% 67%); transform: scaleX(-1); }
.icon-unknown::before { content: ""; position: absolute; width: 16px; height: 16px; filter: blur(1px); }
`, 'utf8');

function run(icon, variant = '', size = null) {
  return new Promise((resolve, reject) => {
    const key = variant ? `${icon}-${variant}` : icon;
    const output = path.join(temp, `${key}.svg`);
    const report = path.join(temp, `${key}.json`);
    const args = [cli, '--css', css, '--icon', icon];
    if (variant) args.push('--variant', variant);
    if (size !== null) args.push('--size', String(size));
    args.push('--output', output, '--report', report);
    const child = spawn(process.execPath, args, { cwd: root, windowsHide: true });
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
assert.match(dotted.svg, /<line x1="0" y1="5" x2="12" y2="5"/);

const screenshot = await run('screenshot');
assert.equal(screenshot.code, 0);
assert.equal(screenshot.report.status, 'converted');
assert.match(screenshot.svg, /width="16" height="16" viewBox="0 0 16 16"/);
assert.match(screenshot.svg, /x="0\.5" y="2\.5" width="15" height="11"/);
assert.doesNotMatch(screenshot.svg, /overflow="visible"/);

const solid = await run('solid');
assert.equal(solid.code, 0);
assert.equal(solid.report.status, 'converted');
assert.equal(solid.report.shapeCount, 1);
assert.match(solid.svg, /stroke="currentColor"/);

const transform = await run('transform');
assert.equal(transform.code, 0);
assert.equal(transform.report.status, 'converted');
assert.match(transform.svg, /points="16,4\.02 16,6 2,6 9,0 9,4\.02"/);
assert.doesNotMatch(transform.svg, /<clipPath/);

const rootBorder = await run('root-border');
assert.equal(rootBorder.code, 0);
assert.equal(rootBorder.report.status, 'converted');
assert.match(rootBorder.svg, /x="1" y="1" width="14" height="14"/);

const relative = await run('relative', '', 18);
assert.equal(relative.code, 0);
assert.match(relative.svg, /x="1" y="5" width="16" height="10"/);

const prefix = await run('prefix');
assert.equal(prefix.code, 0);
assert.equal(prefix.report.shapeCount, 1);

const mirror = await run('mirror');
assert.equal(mirror.code, 0);
assert.match(mirror.svg, /<polygon points="8,8 5,5 5,11" \/>/);

const rounded = await run('rounded');
assert.equal(rounded.code, 0);
assert.match(rounded.svg, /rx="1" ry="1"/);

const rotatedBorder = await run('rotated-border');
assert.equal(rotatedBorder.code, 0);
assert.match(rotatedBorder.svg, /<polygon points=/);

const checkbox = await run('checkbox');
assert.equal(checkbox.code, 0);
assert.equal(checkbox.report.shapeCount, 1);
assert.match(checkbox.svg, /x="2" y="2" width="12" height="12"/);
const checkboxChecked = await run('checkbox', 'checked');
assert.equal(checkboxChecked.code, 0);
assert.equal(checkboxChecked.report.shapeCount, 2);
assert.match(checkboxChecked.svg, /<polygon points="5,5 11,5 11,11 5,11" \/>/);

const unknown = await run('unknown');
assert.equal(unknown.code, 2);
assert.equal(unknown.report.status, 'manual-review');
assert.ok(unknown.report.warnings.some((warning) => warning.includes('filter')));

console.log('All converter tests passed.');
