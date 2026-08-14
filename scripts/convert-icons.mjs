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
  --variant <name> Convert a modifier state such as "checked".
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
    if (arg === '--variant') { args.variant = argv[++i]; continue; }
    if (arg === '--output') { args.output = argv[++i]; continue; }
    if (arg === '--report') { args.report = argv[++i]; continue; }
    if (arg === '--size') { args.size = Number(argv[++i]); continue; }
    if (arg.startsWith('--css=')) { args.css.push(arg.slice(6)); continue; }
    if (arg.startsWith('--icon=')) { args.icon = arg.slice(7); continue; }
    if (arg.startsWith('--variant=')) { args.variant = arg.slice(10); continue; }
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

function collectRules(rules, selector, variant = '') {
  const grouped = new Map();
  const variantSelector = variant ? `${selector}.${variant}` : '';
  const matchesSelector = (normalized) => {
    const bases = [selector, variantSelector].filter(Boolean);
    return bases.some((base) => normalized === base
      || normalized.startsWith(`${base}::`)
      || (normalized.startsWith(`${base} > `) && /::(before|after)$/.test(normalized))
      || (normalized.startsWith(`${base} `) && /::(before|after)$/.test(normalized)));
  };
  for (const rule of rules) {
    for (const candidate of rule.selectors) {
      const normalized = candidate.replaceAll(/\s+/g, ' ').trim();
      if (!matchesSelector(normalized)) continue;
      const key = (normalized === selector || normalized === variantSelector) ? 'root' : normalized;
      grouped.set(key, [...(grouped.get(key) ?? []), ...rule.declarations]);
    }
  }
  return new Map([...grouped.entries()].map(([key, declarations]) => [key, declarationMap(declarations)]));
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
    const kind = String(transform.kind).toLowerCase();
    if (kind === 'scalex') x = center[0] + (x - center[0]) * transform.value;
    if (kind === 'scaley') y = center[1] + (y - center[1]) * transform.value;
    if (kind === 'rotate') {
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

function boxFor(map, size, warnings, context, defaultBoxSizing = 'content-box', containing = null) {
  const allBorder = parseBorder(map.get('border') ?? '');
  const borderFor = (side) => parseBorder(map.get(`border-${side}`) ?? '') ?? allBorder;
  const borderTop = borderFor('top')?.width ?? 0;
  const borderRight = borderFor('right')?.width ?? 0;
  const borderBottom = borderFor('bottom')?.width ?? 0;
  const borderLeft = borderFor('left')?.width ?? 0;
  const declaredWidth = number(map.get('width') ?? '') ?? 0;
  const declaredHeight = number(map.get('height') ?? '') ?? 0;
  const boxSizing = map.get('box-sizing')?.toLowerCase() ?? defaultBoxSizing;
  const width = boxSizing === 'border-box' ? Math.max(0, declaredWidth - borderLeft - borderRight) : declaredWidth;
  const height = boxSizing === 'border-box' ? Math.max(0, declaredHeight - borderTop - borderBottom) : declaredHeight;
  const visualWidth = boxSizing === 'border-box' ? declaredWidth : declaredWidth + borderLeft + borderRight;
  const visualHeight = boxSizing === 'border-box' ? declaredHeight : declaredHeight + borderTop + borderBottom;
  const inset = map.get('inset')?.trim();
  const readOffset = (side) => {
    const direct = number(map.get(side) ?? '');
    if (direct !== null) return direct;
    if (inset === '0') return 0;
    return null;
  };
  const marginAuto = map.get('margin')?.trim() === 'auto';
  const positioned = map.get('position') === 'absolute' || map.get('position') === 'fixed';
  const containingBox = containing ?? { x: 0, y: 0, width: size, height: size };
  const placeAxis = (start, end, visualSize, axisStart, axisSize) => {
    if (positioned && start !== null && end !== null && marginAuto) return axisStart + start + (axisSize - start - end - visualSize) / 2;
    if (start !== null) return axisStart + start;
    if (end !== null) return axisStart + axisSize - end - visualSize;
    if (marginAuto) return axisStart + (axisSize - visualSize) / 2;
    return 0;
  };
  const x = positioned ? placeAxis(readOffset('left'), readOffset('right'), visualWidth, containingBox.x, containingBox.width) : (number(map.get('left') ?? '') ?? 0);
  const y = positioned ? placeAxis(readOffset('top'), readOffset('bottom'), visualHeight, containingBox.y, containingBox.height) : (number(map.get('top') ?? '') ?? 0);
  if (!declaredWidth && !declaredHeight && !borderTop && !borderRight && !borderBottom && !borderLeft) warnings.push(`${context}: no px geometry found`);
  return { x, y, width, height, visualWidth, visualHeight, borderTop, borderRight, borderBottom, borderLeft, boxSizing };
}

function parsePolygon(value, box, transforms, size) {
  const match = value.match(/polygon\(([^)]+)\)/i);
  if (!match) return null;
  const referenceWidth = box.visualWidth ?? box.width;
  const referenceHeight = box.visualHeight ?? box.height;
  const localPoints = splitOutside(match[1]).map((pair) => {
    const [x, y] = pair.trim().split(/\s+/);
    return [box.x + percentOrNumber(x, referenceWidth), box.y + percentOrNumber(y, referenceHeight)];
  });
  const center = [box.x + referenceWidth / 2, box.y + referenceHeight / 2];
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
  const match = value.match(/^(\d+(?:\.\d+)?)px\s+(solid|dotted|dashed)\s+(currentColor|transparent)$/i);
  return match ? { width: Number(match[1]), style: match[2].toLowerCase(), color: match[3].toLowerCase() } : null;
}

function parseBorderRadius(value, box) {
  if (!value) return null;
  const [horizontal, vertical = horizontal] = splitOutside(value, '/');
  const parseRadius = (token, total) => {
    const trimmed = token.trim().split(/\s+/)[0];
    if (trimmed.endsWith('%')) return Number(trimmed.slice(0, -1)) * total / 100;
    return number(trimmed) ?? 0;
  };
  return {
    rx: Math.min(parseRadius(horizontal, box.visualWidth), box.visualWidth / 2),
    ry: Math.min(parseRadius(vertical, box.visualHeight), box.visualHeight / 2),
  };
}

function transformCenter(box) {
  return [box.x + box.visualWidth / 2, box.y + box.visualHeight / 2];
}

function transformedRect(x, y, width, height, transforms, center) {
  const points = [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
  return {
    type: 'polygon',
    points: points.map((point) => transformPoint(point, center ?? [x + width / 2, y + height / 2], transforms)),
  };
}

function addBorderShapes(shapes, map, box, warnings, context, transforms = [], clipPoints = null) {
  const all = parseBorder(map.get('border') ?? '');
  const hasSideBorder = ['top', 'right', 'bottom', 'left'].some((side) => map.has(`border-${side}`));
  const outerWidth = box.visualWidth ?? box.width;
  const outerHeight = box.visualHeight ?? box.height;
  const center = transformCenter(box);
  const radius = parseBorderRadius(map.get('border-radius'), box);
  const sides = {};
  for (const side of ['top', 'right', 'bottom', 'left']) sides[side] = parseBorder(map.get(`border-${side}`) ?? '') ?? all;

  if (box.width === 0 && box.height === 0 && Object.values(sides).some(Boolean)) {
    const point = [box.x + box.borderLeft, box.y + box.borderTop];
    const addTriangle = (side, points) => {
      const border = sides[side];
      if (border?.color === 'currentcolor') shapes.push({ type: 'polygon', points, clipPoints });
    };
    addTriangle('left', [point, [point[0] - box.borderLeft, point[1] - box.borderTop], [point[0] - box.borderLeft, point[1] + box.borderBottom]]);
    addTriangle('right', [point, [point[0] + box.borderRight, point[1] - box.borderTop], [point[0] + box.borderRight, point[1] + box.borderBottom]]);
    addTriangle('top', [point, [point[0] - box.borderLeft, point[1] - box.borderTop], [point[0] + box.borderRight, point[1] - box.borderTop]]);
    addTriangle('bottom', [point, [point[0] - box.borderLeft, point[1] + box.borderBottom], [point[0] + box.borderRight, point[1] + box.borderBottom]]);
    return;
  }
  if (all && !hasSideBorder) {
    if (all.color === 'currentcolor') {
      if (transforms.length && all.style === 'solid' && !radius) {
        const outer = [[box.x, box.y], [box.x + outerWidth, box.y], [box.x + outerWidth, box.y + outerHeight], [box.x, box.y + outerHeight]];
        shapes.push({ type: 'strokePolygon', points: outer.map((point) => transformPoint(point, center, transforms)), style: all.style, strokeWidth: all.width, clipPoints });
      } else {
        shapes.push({
          type: all.style === 'dotted' ? 'dottedRect' : 'strokeRect',
          x: box.x,
          y: box.y,
          width: outerWidth,
          height: outerHeight,
          style: all.style,
          strokeWidth: all.width,
          transforms,
          radius,
          clipPoints,
        });
      }
    }
    return;
  }
  for (const [side, border] of Object.entries(sides)) {
    if (!border) continue;
    if (border.style !== 'solid' && border.style !== 'dotted') warnings.push(`${context}: unsupported border style ${border.style}`);
    if (border.color !== 'currentcolor') continue;
    const add = (x, y, width, height) => {
      if (border.style === 'dotted') {
        warnings.push(`${context}: dotted individual border side uses a rectangular approximation`);
        shapes.push({ type: 'strokeRect', x, y, width, height, style: border.style, strokeWidth: border.width, clipPoints });
      } else {
        shapes.push({ ...transformedRect(x, y, width, height, transforms, center), clipPoints });
      }
    };
    if (side === 'top') add(box.x, box.y, outerWidth, border.width);
    if (side === 'bottom') add(box.x, box.y + box.borderTop + box.height, outerWidth, border.width);
    if (side === 'left') add(box.x, box.y, border.width, outerHeight);
    if (side === 'right') add(box.x + box.borderLeft + box.width, box.y, border.width, outerHeight);
  }
}

function convertIcon(rules, icon, size, variant = '') {
  const selector = `.icon-${icon}`;
  const grouped = collectRules(rules, selector, variant);
  const warnings = [];
  const shapes = [];
  if (!grouped.has('root') && grouped.size === 0) warnings.push(`${selector}: no matching CSS rules`);
  const root = grouped.get('root') ?? new Map();
  const rootBox = boxFor(root, size, warnings, `${selector} root`, 'border-box');
  // VS treats the selected icon rule as content inside the base 16x16 icon
  // canvas. Center the non-default root box first, then keep its top/left
  // relative offset. This matters for awkward (5x12, top:-1px) and
  // screenshot (16x12, top:2px).
  if (rootBox.visualWidth !== size) rootBox.x += (size - rootBox.visualWidth) / 2;
  if (rootBox.visualHeight !== size) rootBox.y += (size - rootBox.visualHeight) / 2;
  addBorderShapes(shapes, root, rootBox, warnings, `${selector} root`);
  const containing = {
    x: rootBox.x + rootBox.borderLeft,
    y: rootBox.y + rootBox.borderTop,
    width: rootBox.width,
    height: rootBox.height,
  };

  for (const [part, map] of grouped) {
    if (part === 'root') continue;
    const context = part === `${selector}::before` || part === `${selector}::after` ? part : `${part}`;
    const box = boxFor(map, size, warnings, context, 'content-box', containing);
    const transforms = parseTransform(map.get('transform') ?? '', warnings, context);
    const clipPath = map.get('clip-path');
    const clipPoints = clipPath ? parsePolygon(clipPath, box, transforms, size) : null;
    if (clipPath && !clipPoints) warnings.push(`${context}: unsupported clip-path ${clipPath}`);
    if (map.has('background') || map.has('background-color') || map.has('border-top') || map.has('border-bottom') || map.has('border-left') || map.has('border-right') || map.has('border')) {
      const background = map.get('background') ?? map.get('background-color') ?? '';
      const contentX = box.x + box.borderLeft;
      const contentY = box.y + box.borderTop;
      const contentBox = { ...box, x: contentX, y: contentY };
      if (/^currentColor$/i.test(background)) {
        const radius = parseBorderRadius(map.get('border-radius'), contentBox);
        if (clipPoints) {
          shapes.push({ type: 'polygon', points: clipPoints });
        } else if (radius) {
          if (radius && transforms.length) warnings.push(`${context}: transformed rounded/background rectangle needs manual review`);
          shapes.push({ type: 'rect', x: contentBox.x, y: contentBox.y, width: contentBox.width, height: contentBox.height, radius, clipPoints });
        } else {
          const corners = [[contentBox.x, contentBox.y], [contentBox.x + contentBox.width, contentBox.y], [contentBox.x + contentBox.width, contentBox.y + contentBox.height], [contentBox.x, contentBox.y + contentBox.height]];
          shapes.push({ type: 'polygon', points: corners.map((point) => transformPoint(point, transformCenter(box), transforms)), clipPoints });
        }
      } else if (/linear-gradient/i.test(background)) {
        shapes.push(...parseGradientRects(background, contentBox, warnings, context).map((shape) => ({ ...shape, clipPoints })));
      } else if (background) {
        warnings.push(`${context}: unsupported background ${background}`);
      }
      addBorderShapes(shapes, map, box, warnings, context, transforms, clipPoints);
    } else if (clipPoints) {
      shapes.push({ type: 'polygon', points: clipPoints });
    }
    for (const [property, value] of map) {
      if (ignoredProperties.has(property) || property.startsWith('--') || property === 'width' || property === 'height' || property === 'background' || property === 'background-color' || property === 'clip-path' || property.startsWith('border') || property === 'transform') continue;
      warnings.push(`${context}: unsupported declaration ${property}: ${value}`);
    }
  }
  return { selector, shapes, warnings: [...new Set(warnings)] };
}

function shapeToSvg(shape) {
  const clip = shape.clipId ? ` clip-path="url(#${shape.clipId})"` : '';
  if (shape.type === 'rect') {
    const radius = shape.radius ? ` rx="${formatNumber(shape.radius.rx)}" ry="${formatNumber(shape.radius.ry)}"` : '';
    return `<rect x="${formatNumber(shape.x)}" y="${formatNumber(shape.y)}" width="${formatNumber(shape.width)}" height="${formatNumber(shape.height)}"${radius}${clip} />`;
  }
  if (shape.type === 'polygon') return `<polygon points="${pointsAttribute(shape.points)}"${clip} />`;
  if (shape.type === 'dottedRect') {
    // CSS dotted borders start their dash pattern at the border-box edge.
    // Keep the stroke centerline half a border-width inside the box, but let
    // each line run from the actual CSS side endpoint. This avoids the subtle
    // one-pixel endpoint phase shift caused by using inset centerline ends.
    const x1 = shape.x;
    const y1 = shape.y;
    const x2 = shape.x + shape.width;
    const y2 = shape.y + shape.height;
    const top = shape.y + shape.strokeWidth / 2;
    const right = shape.x + shape.width - shape.strokeWidth / 2;
    const bottom = shape.y + shape.height - shape.strokeWidth / 2;
    const left = shape.x + shape.strokeWidth / 2;
    const dash = `${formatNumber(shape.strokeWidth)} ${formatNumber(shape.strokeWidth)}`;
    const attrs = ` fill="none" stroke="currentColor" stroke-width="${formatNumber(shape.strokeWidth)}" stroke-dasharray="${dash}" stroke-dashoffset="0" stroke-linecap="butt"${clip}`;
    return [
      `<line x1="${formatNumber(x1)}" y1="${formatNumber(top)}" x2="${formatNumber(x2)}" y2="${formatNumber(top)}"${attrs} />`,
      `<line x1="${formatNumber(right)}" y1="${formatNumber(y1)}" x2="${formatNumber(right)}" y2="${formatNumber(y2)}"${attrs} />`,
      `<line x1="${formatNumber(x2)}" y1="${formatNumber(bottom)}" x2="${formatNumber(x1)}" y2="${formatNumber(bottom)}"${attrs} />`,
      `<line x1="${formatNumber(left)}" y1="${formatNumber(y2)}" x2="${formatNumber(left)}" y2="${formatNumber(y1)}"${attrs} />`,
    ].join('\n    ');
  }
  if (shape.type === 'strokeRect') {
    const dash = shape.style === 'dotted' ? ' stroke-dasharray="2 2"' : '';
    const radius = shape.radius ? ` rx="${formatNumber(Math.max(0, shape.radius.rx - shape.strokeWidth / 2))}" ry="${formatNumber(Math.max(0, shape.radius.ry - shape.strokeWidth / 2))}"` : '';
    return `<rect x="${formatNumber(shape.x + shape.strokeWidth / 2)}" y="${formatNumber(shape.y + shape.strokeWidth / 2)}" width="${formatNumber(shape.width - shape.strokeWidth)}" height="${formatNumber(shape.height - shape.strokeWidth)}" fill="none" stroke="currentColor" stroke-width="${formatNumber(shape.strokeWidth)}"${radius}${dash}${clip} />`;
  }
  if (shape.type === 'strokePolygon') {
    const dash = shape.style === 'dotted' ? ' stroke-dasharray="1 1"' : '';
    return `<polygon points="${pointsAttribute(shape.points)}" fill="none" stroke="currentColor" stroke-width="${formatNumber(shape.strokeWidth)}"${dash}${clip} />`;
  }
  return '';
}

function toSvg(icon, size, shapes, variant = '') {
  const title = `${icon}${variant ? ` ${variant}` : ''} CSS icon candidate`;
  const clippedShapes = shapes.map((shape, index) => {
    if (!shape.clipPoints) return shape;
    return { ...shape, clipId: `clip-${index}` };
  });
  const clips = clippedShapes.filter((shape) => shape.clipPoints).map((shape) => `    <clipPath id="${shape.clipId}"><polygon points="${pointsAttribute(shape.clipPoints)}" /></clipPath>`);
  const defs = clips.length ? `  <defs>\n${clips.join('\n')}\n  </defs>\n` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-labelledby="title">\n  <title id="title">${title}</title>\n${defs}  <g fill="currentColor">\n    ${clippedShapes.map(shapeToSvg).join('\n    ')}\n  </g>\n</svg>\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { usage(); return; }
  const rules = [];
  for (const cssPath of args.css) rules.push(...parseCssRules(await fs.readFile(cssPath, 'utf8'), cssPath));
  const result = convertIcon(rules, args.icon, args.size, args.variant ?? '');
  const report = {
    icon: args.icon,
    variant: args.variant ?? null,
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
  await fs.writeFile(outputPath, toSvg(args.icon, args.size, result.shapes, args.variant ?? ''), 'utf8');
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, output: outputPath, report: reportPath }, null, 2));
  if (report.status === 'manual-review') process.exitCode = 2;
}

try { await main(); } catch (error) {
  console.error(`css-to-svg-converter: ${error.message}`);
  process.exitCode = 1;
}
