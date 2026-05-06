// Slim types module: only what the MCP shim consumes.
// Mirrors definitions in Val4evr/excalidraw-zephy:src/types.ts so JSON
// over-the-wire stays compatible. No in-memory Maps or room helpers here —
// state lives on the canvas server, not in this process.

export type ExcalidrawElementType =
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'arrow'
  | 'text'
  | 'line'
  | 'freedraw'
  | 'image';

export const EXCALIDRAW_ELEMENT_TYPES: Record<string, ExcalidrawElementType> = {
  RECTANGLE: 'rectangle',
  ELLIPSE: 'ellipse',
  DIAMOND: 'diamond',
  ARROW: 'arrow',
  TEXT: 'text',
  FREEDRAW: 'freedraw',
  LINE: 'line',
  IMAGE: 'image',
} as const;

export interface ServerElement {
  id: string;
  type: ExcalidrawElementType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  opacity?: number;
  groupIds?: string[];
  frameId?: string | null;
  roundness?: { type: number; value?: number } | null;
  seed?: number;
  versionNonce?: number;
  isDeleted?: boolean;
  locked?: boolean;
  link?: string | null;
  customData?: Record<string, any> | null;
  boundElements?: readonly { id: string; type: 'text' | 'arrow' }[] | null;
  updated?: number;
  containerId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  syncedAt?: string;
  source?: string;
  syncTimestamp?: string;
  text?: string;
  originalText?: string;
  fontSize?: number;
  fontFamily?: string | number;
  label?: { text: string };
  points?: any;
  start?: { id: string };
  end?: { id: string };
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  fileId?: string;
  status?: string;
  scale?: [number, number];
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

export function validateElement(element: Partial<ServerElement>): element is ServerElement {
  const required: (keyof ServerElement)[] = ['type', 'x', 'y'];
  if (!required.every((f) => f in element)) {
    throw new Error(`Missing required fields: ${required.join(', ')}`);
  }
  if (!Object.values(EXCALIDRAW_ELEMENT_TYPES).includes(element.type as ExcalidrawElementType)) {
    throw new Error(`Invalid element type: ${element.type}`);
  }
  return true;
}

// Excalidraw uses numeric font ids on the wire. Map common names to ids.
// 1 = Virgil (handwritten), 2 = Helvetica, 3 = Cascadia (mono),
// 5 = Excalifont, 6 = Nunito, 7 = Lilita One, 8 = Comic Shanns
export function normalizeFontFamily(fontFamily: string | number | undefined): number | undefined {
  if (fontFamily === undefined) return undefined;
  if (typeof fontFamily === 'number') return fontFamily;
  const map: Record<string, number> = {
    virgil: 1, hand: 1, handwritten: 1,
    helvetica: 2, sans: 2, 'sans-serif': 2,
    cascadia: 3, mono: 3, monospace: 3,
    excalifont: 5,
    nunito: 6,
    lilita: 7, 'lilita one': 7,
    'comic shanns': 8, comic: 8,
    '1': 1, '2': 2, '3': 3, '5': 5, '6': 6, '7': 7, '8': 8,
  };
  return map[fontFamily.toLowerCase()];
}
