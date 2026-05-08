import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSceneDescription } from '../dist/sceneDescription.js';

function makeElement(index, overrides = {}) {
  return {
    id: `el-${index}`,
    type: 'text',
    x: (index % 4) * 240,
    y: Math.floor(index / 4) * 120,
    width: 200,
    height: 40,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    text: `Synthetic board item ${index} with enough text to be noisy when dumped wholesale`,
    fontSize: index % 20 === 0 ? 40 : 18,
    ...overrides,
  };
}

function makeLargeScene() {
  const elements = Array.from({ length: 180 }, (_, index) => {
    const yOffset = index >= 40 ? 5000 : 0;
    return makeElement(index, { y: Math.floor(index / 4) * 120 + yOffset });
  });
  elements.push(makeElement(900, {
    id: 'session-heading',
    y: 3000,
    text: 'SESSION 02 - Business Model Canvas',
    fontSize: 44,
  }));
  elements.push({
    id: 'arrow-1',
    type: 'arrow',
    x: 50,
    y: 3200,
    width: 300,
    height: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    startBinding: { elementId: 'el-0' },
    endBinding: { elementId: 'session-heading' },
  });
  return elements;
}

test('overview mode gives a bounded map instead of dumping every element', () => {
  const output = buildSceneDescription(makeLargeScene());

  assert.match(output, /## Canvas Description/);
  assert.match(output, /### Sections/);
  assert.match(output, /### Prominent Text/);
  assert.doesNotMatch(output, /### Elements/);
  assert.ok(output.length < 10_000, `overview should stay compact, got ${output.length} chars`);
});

test('elements mode pages through matching elements', () => {
  const output = buildSceneDescription(makeLargeScene(), {
    detail: 'elements',
    limit: 5,
    offset: 10,
    types: ['text'],
  });

  assert.match(output, /### Elements \(5\/181, offset 10, limit 5\)/);
  assert.match(output, /el-10/);
  assert.doesNotMatch(output, /el-9/);
  assert.match(output, /Call again with offset 15/);
});

test('sectionIndex focuses descriptions on one spatial section', () => {
  const output = buildSceneDescription(makeLargeScene(), {
    detail: 'elements',
    sectionIndex: 1,
    limit: 20,
  });

  assert.match(output, /Scope: section 1/);
  assert.match(output, /session-heading/);
  assert.doesNotMatch(output, /el-0/);
});

test('connections mode reports bound arrows without an element firehose', () => {
  const output = buildSceneDescription(makeLargeScene(), {
    detail: 'connections',
    limit: 10,
  });

  assert.match(output, /### Connections \(1\/1, offset 0, limit 10\)/);
  assert.match(output, /el-0 --> session-heading \(arrow: arrow-1\)/);
  assert.doesNotMatch(output, /### Elements/);
});
