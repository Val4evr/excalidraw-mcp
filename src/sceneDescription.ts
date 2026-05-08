import { EXCALIDRAW_ELEMENT_TYPES, ExcalidrawElementType, ServerElement } from './types.js';

export const SCENE_DESCRIPTION_DETAILS = [
  'overview',
  'elements',
  'connections',
  'groups',
  'full',
] as const;

export type SceneDescriptionDetail = (typeof SCENE_DESCRIPTION_DETAILS)[number];

export interface SceneDescriptionOptions {
  detail?: SceneDescriptionDetail;
  limit?: number;
  offset?: number;
  sectionIndex?: number;
  sectionLimit?: number;
  maxTextLength?: number;
  types?: ExcalidrawElementType[];
  textIncludes?: string;
  bbox?: {
    x_min?: number;
    x_max?: number;
    y_min?: number;
    y_max?: number;
  };
}

interface SceneSection {
  index: number;
  elements: ServerElement[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const DEFAULT_ELEMENT_LIMIT = 80;
const DEFAULT_SECTION_LIMIT = 24;
const DEFAULT_TEXT_LIMIT = 220;
const SECTION_GAP = 240;
const MAX_AUTO_SECTIONS = 24;
const TARGET_LARGE_BOARD_SECTIONS = 12;

export function buildSceneDescription(elements: ServerElement[], options: SceneDescriptionOptions = {}): string {
  const activeElements = elements.filter((el) => !el.isDeleted);

  if (activeElements.length === 0) {
    return 'The canvas is empty. No elements to describe.';
  }

  const sections = buildSections(activeElements);
  const scopedElements = getScopedElements(activeElements, sections, options);
  const filteredElements = filterElements(scopedElements, options);
  const detail = options.detail ?? 'overview';
  const maxTextLength = clampInt(options.maxTextLength, 20, 2000, DEFAULT_TEXT_LIMIT);
  const offset = clampInt(options.offset, 0, Number.MAX_SAFE_INTEGER, 0);
  const requestedLimit = options.detail === 'full'
    ? filteredElements.length
    : DEFAULT_ELEMENT_LIMIT;
  const limit = clampInt(options.limit, 1, 5000, requestedLimit);

  const allTypeCounts = countByType(activeElements);
  const allBounds = getBounds(activeElements);
  const lines: string[] = [];

  lines.push('## Canvas Description');
  lines.push(`Total elements: ${activeElements.length}`);
  lines.push(`Types: ${formatTypeCounts(allTypeCounts)}`);
  lines.push(`Bounding box: ${formatBounds(allBounds)}`);

  const filterSummary = describeFilters(options, sections);
  if (filterSummary.length > 0) {
    lines.push(`Scope: ${filterSummary.join('; ')}`);
    lines.push(`Scoped elements: ${filteredElements.length}`);
  }

  if (detail === 'overview') {
    appendSectionIndex(lines, sections, options.sectionLimit, maxTextLength);
    appendProminentText(lines, activeElements, maxTextLength);
    lines.push('');
    lines.push('Tip: call `describe_scene` with `detail: "elements"` plus `sectionIndex`, `bbox`, `types`, `offset`, or `limit` to inspect a focused slice. Use `detail: "full"` only when you really want the complete dump.');
    return lines.join('\n');
  }

  if (detail === 'connections') {
    appendConnections(lines, activeElements, filteredElements, offset, limit);
    return lines.join('\n');
  }

  if (detail === 'groups') {
    appendGroups(lines, filteredElements, offset, limit);
    return lines.join('\n');
  }

  appendElements(lines, filteredElements, offset, limit, maxTextLength);

  if (detail === 'full') {
    appendConnections(lines, activeElements, filteredElements, 0, Number.MAX_SAFE_INTEGER);
    appendGroups(lines, filteredElements, 0, Number.MAX_SAFE_INTEGER);
  }

  return lines.join('\n');
}

function getScopedElements(elements: ServerElement[], sections: SceneSection[], options: SceneDescriptionOptions): ServerElement[] {
  if (options.sectionIndex === undefined) return elements;
  const section = sections.find((candidate) => candidate.index === options.sectionIndex);
  return section?.elements ?? [];
}

function filterElements(elements: ServerElement[], options: SceneDescriptionOptions): ServerElement[] {
  const search = options.textIncludes?.toLowerCase();

  return sortElements(elements).filter((el) => {
    if (options.types && options.types.length > 0 && !options.types.includes(el.type)) {
      return false;
    }

    if (search) {
      const text = getElementText(el).toLowerCase();
      if (!text.includes(search)) return false;
    }

    if (options.bbox && !intersectsBbox(el, options.bbox)) {
      return false;
    }

    return true;
  });
}

function buildSections(elements: ServerElement[]): SceneSection[] {
  const sorted = sortElements(elements);
  const sections: SceneSection[] = [];

  for (const el of sorted) {
    const bounds = getElementBounds(el);
    const previous = sections[sections.length - 1];
    const startsNewSection = previous && bounds.minY - previous.maxY > SECTION_GAP;

    if (!previous || startsNewSection) {
      sections.push({
        index: sections.length,
        elements: [el],
        ...bounds,
      });
      continue;
    }

    previous.elements.push(el);
    previous.minX = Math.min(previous.minX, bounds.minX);
    previous.minY = Math.min(previous.minY, bounds.minY);
    previous.maxX = Math.max(previous.maxX, bounds.maxX);
    previous.maxY = Math.max(previous.maxY, bounds.maxY);
  }

  if (sections.length <= 1 && elements.length > 100) {
    return buildVerticalBins(elements, TARGET_LARGE_BOARD_SECTIONS);
  }

  if (sections.length <= MAX_AUTO_SECTIONS) return sections;
  return buildVerticalBins(elements, MAX_AUTO_SECTIONS);
}

function buildVerticalBins(elements: ServerElement[], binCount: number): SceneSection[] {
  const bounds = getBounds(elements);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const binHeight = height / binCount;
  const bins: SceneSection[] = [];

  for (let index = 0; index < binCount; index += 1) {
    bins.push({
      index,
      elements: [],
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    });
  }

  for (const el of elements) {
    const elementBounds = getElementBounds(el);
    const rawIndex = Math.floor((elementBounds.minY - bounds.minY) / binHeight);
    const index = Math.max(0, Math.min(binCount - 1, rawIndex));
    const bin = bins[index]!;
    bin.elements.push(el);
    bin.minX = Math.min(bin.minX, elementBounds.minX);
    bin.minY = Math.min(bin.minY, elementBounds.minY);
    bin.maxX = Math.max(bin.maxX, elementBounds.maxX);
    bin.maxY = Math.max(bin.maxY, elementBounds.maxY);
  }

  return bins
    .filter((bin) => bin.elements.length > 0)
    .map((bin, index) => ({ ...bin, index, elements: sortElements(bin.elements) }));
}

function appendSectionIndex(
  lines: string[],
  sections: SceneSection[],
  requestedLimit: number | undefined,
  maxTextLength: number,
): void {
  const limit = clampInt(requestedLimit, 1, 100, DEFAULT_SECTION_LIMIT);
  const shown = sections.slice(0, limit);

  lines.push('');
  lines.push(`### Sections (${shown.length}/${sections.length})`);

  for (const section of shown) {
    const typeCounts = formatTypeCounts(countByType(section.elements));
    const label = sectionLabel(section, maxTextLength);
    lines.push(`  [${section.index}] ${section.elements.length} elements | ${formatBounds(section)} | ${typeCounts}${label ? ` | ${label}` : ''}`);
  }

  if (sections.length > shown.length) {
    lines.push(`  ... ${sections.length - shown.length} more sections. Increase sectionLimit to show them.`);
  }
}

function appendProminentText(lines: string[], elements: ServerElement[], maxTextLength: number): void {
  const textElements = sortElements(elements)
    .filter((el) => el.type === 'text' && getElementText(el).trim().length > 0)
    .sort((a, b) => scoreTextElement(b) - scoreTextElement(a))
    .slice(0, 16)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  if (textElements.length === 0) return;

  lines.push('');
  lines.push('### Prominent Text');
  for (const el of textElements) {
    lines.push(`  [${el.id}] at (${Math.round(el.x)}, ${Math.round(el.y)}) | "${truncateText(getElementText(el), maxTextLength)}"`);
  }
}

function appendElements(lines: string[], elements: ServerElement[], offset: number, limit: number, maxTextLength: number): void {
  const page = elements.slice(offset, offset + limit);

  lines.push('');
  lines.push(`### Elements (${page.length}/${elements.length}, offset ${offset}, limit ${limit})`);
  for (const el of page) {
    lines.push(`  ${describeElement(el, maxTextLength)}`);
  }

  if (offset + limit < elements.length) {
    lines.push(`  ... ${elements.length - offset - limit} more elements. Call again with offset ${offset + limit}.`);
  }
}

function appendConnections(
  lines: string[],
  allElements: ServerElement[],
  scopedElements: ServerElement[],
  offset: number,
  limit: number,
): void {
  const scopedIds = new Set(scopedElements.map((el) => el.id));
  const connections = allElements
    .filter((el) => el.type === 'arrow')
    .map((arrow) => {
      const arrowAny = arrow as any;
      const from = arrowAny.startBinding?.elementId || arrowAny.start?.id || '?';
      const to = arrowAny.endBinding?.elementId || arrowAny.end?.id || '?';
      return { arrow, from, to };
    })
    .filter(({ arrow, from, to }) => scopedIds.has(arrow.id) || scopedIds.has(from) || scopedIds.has(to));

  if (connections.length === 0) return;

  const page = connections.slice(offset, offset + limit);
  lines.push('');
  lines.push(`### Connections (${page.length}/${connections.length}, offset ${offset}, limit ${limit})`);
  for (const { arrow, from, to } of page) {
    lines.push(`  ${from} --> ${to} (arrow: ${arrow.id})`);
  }

  if (offset + limit < connections.length) {
    lines.push(`  ... ${connections.length - offset - limit} more connections. Call again with offset ${offset + limit}.`);
  }
}

function appendGroups(lines: string[], elements: ServerElement[], offset: number, limit: number): void {
  const groupMap = new Map<string, string[]>();

  for (const el of elements) {
    for (const groupId of el.groupIds || []) {
      const group = groupMap.get(groupId) || [];
      group.push(el.id);
      groupMap.set(groupId, group);
    }
  }

  const groups = Array.from(groupMap.entries());
  if (groups.length === 0) return;

  const page = groups.slice(offset, offset + limit);
  lines.push('');
  lines.push(`### Groups (${page.length}/${groups.length}, offset ${offset}, limit ${limit})`);
  for (const [groupId, ids] of page) {
    lines.push(`  Group ${groupId}: ${ids.length} elements [${ids.join(', ')}]`);
  }

  if (offset + limit < groups.length) {
    lines.push(`  ... ${groups.length - offset - limit} more groups. Call again with offset ${offset + limit}.`);
  }
}

function describeElement(el: ServerElement, maxTextLength: number): string {
  const parts: string[] = [];
  parts.push(`[${el.id}] ${el.type}`);
  parts.push(`at (${Math.round(el.x)}, ${Math.round(el.y)})`);
  if (el.width || el.height) {
    parts.push(`size ${Math.round(el.width || 0)}x${Math.round(el.height || 0)}`);
  }
  const text = getElementText(el);
  if (text) parts.push(`text: "${truncateText(text, maxTextLength)}"`);
  if (el.backgroundColor && el.backgroundColor !== 'transparent') {
    parts.push(`bg: ${el.backgroundColor}`);
  }
  if (el.strokeColor && el.strokeColor !== '#000000') {
    parts.push(`stroke: ${el.strokeColor}`);
  }
  if (el.locked) parts.push('(locked)');
  if (el.groupIds && el.groupIds.length > 0) {
    parts.push(`groups: [${el.groupIds.join(', ')}]`);
  }
  return parts.join(' | ');
}

function sectionLabel(section: SceneSection, maxTextLength: number): string {
  const headings = section.elements
    .filter((el) => el.type === 'text' && getElementText(el).trim().length > 0)
    .sort((a, b) => scoreTextElement(b) - scoreTextElement(a))
    .slice(0, 3)
    .map((el) => truncateText(getElementText(el), Math.min(90, maxTextLength)));

  if (headings.length === 0) return '';
  return `text: ${headings.map((heading) => `"${heading}"`).join(' / ')}`;
}

function scoreTextElement(el: ServerElement): number {
  const text = getElementText(el);
  const fontSize = typeof el.fontSize === 'number' ? el.fontSize : 16;
  const lengthBonus = Math.min(text.length / 20, 8);
  const uppercaseBonus = text === text.toUpperCase() && text.length > 4 ? 5 : 0;
  return fontSize * 2 + lengthBonus + uppercaseBonus;
}

function sortElements(elements: ServerElement[]): ServerElement[] {
  return [...elements].sort((a, b) => {
    const rowDiff = Math.floor(a.y / 50) - Math.floor(b.y / 50);
    return rowDiff !== 0 ? rowDiff : a.x - b.x;
  });
}

function countByType(elements: ServerElement[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const el of elements) {
    counts[el.type] = (counts[el.type] || 0) + 1;
  }
  return counts;
}

function formatTypeCounts(typeCounts: Record<string, number>): string {
  const typeOrder = Object.values(EXCALIDRAW_ELEMENT_TYPES);
  const orderedEntries = [
    ...typeOrder.filter((type) => typeCounts[type]).map((type) => [type, typeCounts[type]!] as const),
    ...Object.entries(typeCounts).filter(([type]) => !typeOrder.includes(type as ExcalidrawElementType)),
  ];
  return orderedEntries.map(([type, count]) => `${type}(${count})`).join(', ');
}

function getBounds(elements: ServerElement[]): Pick<SceneSection, 'minX' | 'minY' | 'maxX' | 'maxY'> {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    const bounds = getElementBounds(el);
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }

  return { minX, minY, maxX, maxY };
}

function getElementBounds(el: ServerElement): Pick<SceneSection, 'minX' | 'minY' | 'maxX' | 'maxY'> {
  const width = el.width || 0;
  const height = el.height || 0;
  return {
    minX: el.x,
    minY: el.y,
    maxX: el.x + width,
    maxY: el.y + height,
  };
}

function formatBounds(bounds: Pick<SceneSection, 'minX' | 'minY' | 'maxX' | 'maxY'>): string {
  return `(${Math.round(bounds.minX)}, ${Math.round(bounds.minY)}) to (${Math.round(bounds.maxX)}, ${Math.round(bounds.maxY)}) = ${Math.round(bounds.maxX - bounds.minX)}x${Math.round(bounds.maxY - bounds.minY)}`;
}

function getElementText(el: ServerElement): string {
  return el.text || el.label?.text || '';
}

function truncateText(text: string, maxLength: number): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function intersectsBbox(el: ServerElement, bbox: NonNullable<SceneDescriptionOptions['bbox']>): boolean {
  const bounds = getElementBounds(el);
  const xMin = bbox.x_min ?? -Infinity;
  const xMax = bbox.x_max ?? Infinity;
  const yMin = bbox.y_min ?? -Infinity;
  const yMax = bbox.y_max ?? Infinity;

  return bounds.maxX >= xMin && bounds.minX <= xMax && bounds.maxY >= yMin && bounds.minY <= yMax;
}

function describeFilters(options: SceneDescriptionOptions, sections: SceneSection[]): string[] {
  const filters: string[] = [];
  if (options.sectionIndex !== undefined) {
    const section = sections.find((candidate) => candidate.index === options.sectionIndex);
    filters.push(section ? `section ${options.sectionIndex} (${formatBounds(section)})` : `section ${options.sectionIndex} (not found)`);
  }
  if (options.types && options.types.length > 0) filters.push(`types ${options.types.join(', ')}`);
  if (options.textIncludes) filters.push(`text includes "${options.textIncludes}"`);
  if (options.bbox) filters.push(`bbox ${JSON.stringify(options.bbox)}`);
  return filters;
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}
