#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ignoredProperties = new Set([
  'position', 'display', 'content', 'inset', 'margin', 'margin-left', 'margin-right',
  'margin-top', 'margin-bottom', 'box-sizing', 'vertical-align', 'color',
  'transform-origin', 'overflow', 'flex', 'z-index', 'top', 'right', 'bottom', 'left',
]);

function usage() {
  console.log(`Usage: node scripts/convert-icons.mjs --css <file> [--css <file> ...] --icon <name> --output <file> [options]

Options:
  --report <file>  Write a JSON report beside the SVG.
  --size <number>  Square canvas size (default: 16).
  --force          Replace an existing output.
  --help           Show this help.`);
}

function parseArgs(argv) {
  const args = { css: [], size: 16, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--force') { args.force = true; continue; }
    if (arg === '--css') { args.css.push(argv[++i]); continue; }
    if (arg === '--icon') { args.icon = argv[++i]; continue; }
    if (arg === '--output') { args.output = argv[++i]; continue; }
    if (arg === '--report') { args.report = argv[++i]; continue; }
    if (arg === '--size') { args.size = Number(argv[++i]); continue; }
    if (arg.startsWith('--css=')) { args.css.push(arg.slice(6)); continue; }
    if (arg.startsWith('--icon=')) { args.icon = arg.slice(7); continue; }
    if (arg.startsWith('--output=')) { args.output = arg.slice(9); continue; }
    if (arg.startsWith('--report=')) { args.report = arg.slice(9); continue; }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.css.length || !args.icon || !args.output || !Number.isFinite(args.size) || args.size <= 0) {
    throw new Error('Required arguments: --css, --icon, --output; --size must be positive.');
  }
  return args;
}

function splitOutside(value, delimiter = ',') {
  const parts = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === '(') depth += 1;
    if (value[i] === ')') depth -= 1;
    if (value[i] === delimiter && depth === 0) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function parseDeclarations(body) {
  const declarations = [];
  for (const item of splitOutside(body, ';')) {
    const separator = item.indexOf(':');
    if (separator < 0) continue;
    declarations.push({
      property: item.slice(0, separator).trim().toLowerCase(),
      value: item.slice(separator + 1).trim(),
    });
  }
  return declarations;
}

function parseCssRules(source, file) {
  const clean = source.replaceAll(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = rulePattern.exec(clean))) {
    const selectors = splitOutside(match[1].trim()).map((selector) => selector.replaceAll(/\s+/g, ' '));
    const declarations = parseDeclarations(match[2]);
    rules.push({ file, selectors, declarations });
  }
  return rules;
}

function number(value) {
  const match = String(value).trim().match(/^(-?\d+(?:\.\d+)?)px$/i) || String(value).trim().match(/^(-?\d+(?:\.\d+)?)$/);
  return match ? Number(match[1]) : null;
}

function percentOrNumber(value, total) {
  const trimmed = value.trim();
  if (trimmed.endsWith('%')) return Number(trimmed.slice(0, -1)) * total / 100;
  return Number(trimmed);
}

function declarationMap(declarations) {
  const map = new Map();
  for (const declaration of declarations) map.set(declaration.property, declaration.value);
  return map;
}

function collectRules(rules, selector) {
  const exact = new Map();
  for (const rule of rules) {
    for (const candidate of rule.selectors) {
      if (candidate === selector || candidate === `${selector}::before` || candidate === `${selector}::after`) {
        const key = candidate.endsWith('::before') ? 'before' : candidate.endsWith('::after') ? 'after' : 'root';
        exact.set(key, [...(exact.get(key) ?? []), ...rule.declarations]);
      }
    }
  }
  return new Map([...exact.entries()].map(([key, declarations]) => [key, declarationMap(declarations)]));
}

function parseTransform(value, warnings, context) {
  const transforms = [];
  const pattern = /(rotate|scaleX|scaleY)\(\s*([^\)]+)\)/gi;
  let match;
  let consumed = '';
  while ((match = pattern.exec(value))) {
    consumed += match[0];
    if (match[1].toLowerCase() === 'rotate') {
      const angle = match[2].trim().match(/^(-?\d+(?:\.\d+)?)deg$/i);
      if (!angle) warnings.push(`${context}: unsupported rotation ${match[0]}`);
      else transforms.push({ kind: 'rotate', value: Number(angle[1]) });
    } else {
      const factor = Number(match[2].trim());
      if (!Number.isFinite(factor)) warnings.push(`${context}: unsupported scale ${match[0]}`);
      else transforms.push({ kind: match[1].toLowerCase(), value: factor });
    }
  }
  if (value.replaceAll(/\s+/g, '') !== consumed.replaceAll(/\s+/g, '')) warnings.push(`${context}: unsupported transform ${value}`);
  return transforms;
}

function transformPoint(point, center, transforms) {
  let [x, y] = point;
  for (const transform of transforms) {
    if (transform.kind === 'scaleX') x = center[0] + (x - center[0]) * transform.value;
    if (transform.kind === 'scaleY') y = center[1] + (y - center[1]) * transform.value;
    if (transform.kind === 'rotate') {
      const radians = transform.value * Math.PI / 180;
      const dx = x - center[0];
      const dy = y - center[1];
      x = center[0] + dx * Math.cos(radians) - dy * Math.sin(radians);
      y = center[1] + dx * Math.sin(radians) + dy * Math.cos(radians);
    }
  }
  return [x, y];
}

function formatNumber(value) {
  const rounded = Math.abs(value) < 0.000001 ? 0 : Math.round(value * 1000) / 1000;
  return String(rounded);
}

function pointsAttribute(points) {
  return points.map(([x, y]) => `${formatNumber(x)},${formatNumber(y)}`).join(' ');
}

function boxFor(map, size, warnings, context) {
  const width = number(map.get('width') ?? '') ?? 0;
  const height = number(map.get('height') ?? '') ?? 0;
  const borderWidth = number((map.get('border-top') ?? '').match(/^(\d+(?:\.\d+)?)px/)?.[0] ?? '') ?? 0;
  const visualWidth = width;
  const visualHeight = height + borderWidth;
  let x = number(map.get('left') ?? '');
  let y = number(map.get('top') ?? '');
  const right = number(map.get('right') ?? '');
  const bottom = number(map.get('bottom') ?? '');
  if (x === null && right !== null) x = size - right - visualWidth;
  if (y === null && bottom !== null) y = size - bottom - visualHeight;
  if (x === null && y === null && map.get('inset') === '0' && map.get('margin') === 'auto') {
    x = (size - visualWidth) / 2;
    y = (size - visualHeight) / 2;
  }
  if (x === null) x = 0;
  if (y === null) y = 0;
  if (!width && !height && !map.has('border-left') && !map.has('border-right')) warnings.push(`${context}: no px geometry found`);
  return { x, y, width, height, visualWidth, visualHeight };
}

function parsePolygon(value, box, transforms, size) {
  const match = value.match(/polygon\(([^)]+)\)/i);
  if (!match) return null;
  const localPoints = splitOutside(match[1]).map((pair) => {
    const [x, y] = pair.trim().split(/\s+/);
    return [box.x + percentOrNumber(x, box.width), box.y + percentOrNumber(y, box.height)];
  });
  const center = [box.x + box.width / 2, box.y + box.height / 2];
  return localPoints.map((point) => transformPoint(point, center, transforms)).map(([x, y]) => [Math.max(-size, x), Math.max(-size, y)]);
}

function parseGradientRects(value, box, warnings, context) {
  const shapes = [];
  for (const layer of splitOutside(value)) {
    const match = layer.match(/^linear-gradient\(\s*currentColor\s+0\s+0\s*\)\s*(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s*\/\s*(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+no-repeat$/i);
    if (!match) {
      warnings.push(`${context}: unsupported background layer ${layer}`);
      continue;
    }
    shapes.push({ type: 'rect', x: box.x + Number(match[1]), y: box.y + Number(match[2]), width: Number(match[3]), height: Number(match[4]) });
  }
  return shapes;
}

function parseBorder(value) {
  const match = value.match(/^(\d+(?:\.\d+)?)px\s+(solid|dotted|dashed)\s+currentColor$/i);
  return match ? { width: Number(match[1]), style: match[2].toLowerCase() } : null;
}

function transformedRect(x, y, width, height, transforms) {
  const points = [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
  const center = [x + width / 2, y + height / 2];
  return {
    type: 'polygon',
    points: points.map((point) => transformPoint(point, center, transforms)),
  };
}

function addBorderShapes(shapes, map, box, warnings, context, transforms = []) {
  const all = parseBorder(map.get('border') ?? '');
  const sides = {};
  for (const side of ['top', 'right', 'bottom', 'left']) sides[side] = parseBorder(map.get(`border-${side}`) ?? '') ?? all;
  for (const [side, border] of Object.entries(sides)) {
    if (!border) continue;
    if (border.style !== 'solid' && border.style !== 'dotted') warnings.push(`${context}: unsupported border style ${border.style}`);
    const add = (x, y, width, height) => {
      if (border.style === 'dotted') {
        warnings.push(`${context}: dotted border kept as an axis-aligned approximation`);
        shapes.push({ type: 'strokeRect', x, y, width, height, style: border.style, strokeWidth: border.width });
      } else {
        shapes.push(transformedRect(x, y, width, height, transforms));
      }
    };
    if (side === 'top') add(box.x, box.y, box.width, border.width);
    if (side === 'bottom') add(box.x, box.y + box.height - border.width, box.width, border.width);
    if (side === 'left') add(box.x, box.y, border.width, box.height);
    if (side === 'right') add(box.x + box.width - border.width, box.y, border.width, box.height);
  }
}

function convertIcon(rules, icon, size) {
  const selector = `.icon-${icon}`;
  const grouped = collectRules(rules, selector);
  const warnings = [];
  const shapes = [];
  if (!grouped.has('root') && !grouped.has('before') && !grouped.has('after')) warnings.push(`${selector}: no matching CSS rules`);
  const root = grouped.get('root') ?? new Map();
  const rootBox = { x: 0, y: 0, width: number(root.get('width') ?? '') ?? size, height: number(root.get('height') ?? '') ?? size };
  addBorderShapes(shapes, root, rootBox, warnings, `${selector} root`);

  for (const part of ['before', 'after']) {
    const map = grouped.get(part);
    if (!map) continue;
    const context = `${selector}::${part}`;
    const box = boxFor(map, size, warnings, context);
    const transforms = parseTransform(map.get('transform') ?? '', warnings, context);
    const clipPath = map.get('clip-path');
    if (clipPath) {
      const points = parsePolygon(clipPath, box, transforms, size);
      if (points) shapes.push({ type: 'polygon', points });
      else warnings.push(`${context}: unsupported clip-path ${clipPath}`);
    } else if (map.has('background') || map.has('background-color') || map.has('border-top') || map.has('border-bottom') || map.has('border-left') || map.has('border-right') || map.has('border')) {
      const background = map.get('background') ?? map.get('background-color') ?? '';
      if (/^currentColor$/i.test(background)) {
        const corners = [[box.x, box.y], [box.x + box.width, box.y], [box.x + box.width, box.y + box.height], [box.x, box.y + box.height]];
        shapes.push({ type: 'polygon', points: corners.map((point) => transformPoint(point, [box.x + box.width / 2, box.y + box.height / 2], transforms)) });
      } else if (/linear-gradient/i.test(background)) {
        shapes.push(...parseGradientRects(background, box, warnings, context));
      } else if (background) {
        warnings.push(`${context}: unsupported background ${background}`);
      }
      addBorderShapes(shapes, map, box, warnings, context, transforms);
    }
    for (const [property, value] of map) {
      if (ignoredProperties.has(property) || property.startsWith('--') || property === 'width' || property === 'height' || property === 'background' || property === 'background-color' || property === 'clip-path' || property.startsWith('border') || property === 'transform') continue;
      warnings.push(`${context}: unsupported declaration ${property}: ${value}`);
    }
  }
  return { selector, shapes, warnings };
}

function shapeToSvg(shape) {
  if (shape.type === 'rect') return `<rect x="${formatNumber(shape.x)}" y="${formatNumber(shape.y)}" width="${formatNumber(shape.width)}" height="${formatNumber(shape.height)}" />`;
  if (shape.type === 'polygon') return `<polygon points="${pointsAttribute(shape.points)}" />`;
  if (shape.type === 'strokeRect') {
    const dash = shape.style === 'dotted' ? ' stroke-dasharray="1 1"' : '';
    return `<rect x="${formatNumber(shape.x + shape.strokeWidth / 2)}" y="${formatNumber(shape.y + shape.strokeWidth / 2)}" width="${formatNumber(shape.width - shape.strokeWidth)}" height="${formatNumber(shape.height - shape.strokeWidth)}" fill="none" stroke="currentColor" stroke-width="${formatNumber(shape.strokeWidth)}"${dash} />`;
  }
  return '';
}

function toSvg(icon, size, shapes) {
  const title = `${icon} CSS icon candidate`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-labelledby="title">\n  <title id="title">${title}</title>\n  <g fill="currentColor">\n    ${shapes.map(shapeToSvg).join('\n    ')}\n  </g>\n</svg>\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { usage(); return; }
  const rules = [];
  for (const cssPath of args.css) rules.push(...parseCssRules(await fs.readFile(cssPath, 'utf8'), cssPath));
  const result = convertIcon(rules, args.icon, args.size);
  const report = {
    icon: args.icon,
    selector: result.selector,
    status: result.warnings.length || !result.shapes.length ? 'manual-review' : 'converted',
    canvas: { width: args.size, height: args.size },
    inputCss: args.css,
    shapeCount: result.shapes.length,
    warnings: result.warnings,
  };
  const outputPath = path.resolve(args.output);
  const reportPath = path.resolve(args.report ?? `${args.output}.report.json`);
  if (!args.force) {
    for (const target of [outputPath, reportPath]) {
      try { await fs.access(target); throw new Error(`Refusing to overwrite ${target}; use --force.`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(outputPath, toSvg(args.icon, args.size, result.shapes), 'utf8');
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, output: outputPath, report: reportPath }, null, 2));
  if (report.status === 'manual-review') process.exitCode = 2;
}

try { await main(); } catch (error) {
  console.error(`vs-css-icon-converter: ${error.message}`);
  process.exitCode = 1;
}
