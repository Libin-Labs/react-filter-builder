import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as api from '../dist/esm/index.js';

const fields = [
  { id: 'name', type: 'string', getValue: (row) => row.name },
  { id: 'age', type: 'number', getValue: (row) => row.age },
  { id: 'day', type: 'date', getValue: (row) => row.day },
  { id: 'active', type: 'boolean', getValue: (row) => row.active },
];
const rule = (field, operator, value) => ({
  kind: 'rule',
  field,
  fieldType: fields.find((item) => item.id === field).type,
  operator,
  value,
});
const group = (children, combinator = 'and') => ({ kind: 'group', combinator, children });

test('recursive AND/OR evaluation and empty group identities', () => {
  const tree = group([
    rule('age', 'gte', 18),
    group([rule('name', 'startsWith', 'A'), rule('active', 'eq', true)], 'or'),
  ]);
  const predicate = api.compileFilter(tree, fields);
  assert.equal(predicate({ age: 20, name: 'Ada', active: false }), true);
  assert.equal(predicate({ age: 20, name: 'Bob', active: true }), true);
  assert.equal(predicate({ age: 17, name: 'Ada', active: true }), false);
  assert.equal(api.evaluateFilter({}, group([]), fields), true);
  assert.equal(api.evaluateFilter({}, group([], 'or'), fields), false);
});

test('finite numbers without coercion; missing or invalid values always fail, including neq', () => {
  for (const [operator, expected] of [
    ['eq', false],
    ['neq', true],
    ['gt', true],
    ['gte', true],
    ['lt', false],
    ['lte', false],
  ]) {
    assert.equal(
      api.evaluateFilter({ age: 8 }, group([rule('age', operator, 4)]), fields),
      expected,
    );
  }
  for (const age of [undefined, null, '8', NaN, Infinity]) {
    assert.equal(api.evaluateFilter({ age }, group([rule('age', 'neq', 4)]), fields), false);
  }
});

test('case-sensitive literal strings, booleans, calendar-only dates, and no timezone conversion', () => {
  for (const [operator, value] of [
    ['contains', 'da'],
    ['startsWith', 'A'],
    ['endsWith', 'a'],
    ['eq', 'Ada'],
    ['neq', 'ada'],
  ]) {
    assert.equal(
      api.evaluateFilter({ name: 'Ada' }, group([rule('name', operator, value)]), fields),
      true,
    );
  }
  assert.equal(
    api.evaluateFilter({ name: 'Ada' }, group([rule('name', 'contains', 'ada')]), fields),
    false,
  );
  assert.equal(
    api.evaluateFilter({ active: 'true' }, group([rule('active', 'eq', true)]), fields),
    false,
  );
  assert.equal(api.isFilterDate('2024-02-29'), true);
  assert.equal(api.isFilterDate('2023-02-29'), false);
  assert.equal(api.isFilterDate('2024-02-30'), false);
  assert.equal(api.isFilterDate('2024-02-29T00:00:00Z'), false);
  assert.equal(
    api.evaluateFilter({ day: '2024-03-01' }, group([rule('day', 'gt', '2024-02-29')]), fields),
    true,
  );
  assert.equal(
    api.evaluateFilter({ day: 'invalid' }, group([rule('day', 'neq', '2024-02-29')]), fields),
    false,
  );
});

test('validation and serialization return canonical detached data', () => {
  const original = group([rule('name', 'contains', 'a'), rule('age', 'gte', 18)]);
  const validated = api.validateFilter({ ...original, ignored: 'discarded' }, fields);
  assert.deepEqual(validated, original);
  assert.notEqual(validated, original);
  assert.notEqual(validated.children[0], original.children[0]);
  assert.deepEqual(api.parseFilter(api.serializeFilter(original, fields), fields), original);
  const predicate = api.compileFilter(original, fields);
  original.children[1].value = 100;
  assert.equal(predicate({ name: 'Ada', age: 20 }), true);
});

test('unknown fields, incompatible operators/types, invalid JSON, limits and cycles reject', () => {
  const invalid = [
    group([{ ...rule('age', 'eq', 2), field: 'unknown' }]),
    group([{ ...rule('age', 'eq', 2), fieldType: 'string' }]),
    group([rule('age', 'contains', '2')]),
    group([rule('age', 'eq', NaN)]),
    group([rule('day', 'eq', '2023-02-29')]),
    group([rule('active', 'gt', true)]),
    { kind: 'group', combinator: 'xor', children: [] },
    rule('name', 'eq', 'x'),
  ];
  for (const tree of invalid) assert.throws(() => api.validateFilter(tree, fields), TypeError);
  assert.throws(() => api.parseFilter('{broken', fields), SyntaxError);
  assert.throws(() => api.validateFilter(group([]), [fields[0], fields[0]]), TypeError);
  assert.throws(() => api.validateFilter(group([group([])]), fields, { maxDepth: 0 }), RangeError);
  assert.throws(
    () => api.validateFilter(group([rule('age', 'eq', 1)]), fields, { maxNodes: 1 }),
    RangeError,
  );
  assert.throws(() => api.validateFilter(group([]), fields, { maxDepth: 101 }), RangeError);
  const cyclic = group([]);
  cyclic.children.push(cyclic);
  assert.throws(() => api.validateFilter(cyclic, fields), RangeError);
});

test('defaults and operators are type-specific and mutation-safe; CJS exports match', () => {
  assert.deepEqual(
    fields.map(api.createRule).map((item) => item.value),
    ['', 0, '1970-01-01', false],
  );
  const operators = api.operatorsFor('boolean');
  operators.push('contains');
  assert.deepEqual(api.operatorsFor('boolean'), ['eq', 'neq']);
  const cjs = createRequire(import.meta.url)('../dist/cjs/index.js');
  assert.deepEqual(Object.keys(cjs).sort(), Object.keys(api).sort());
  assert.equal(cjs.evaluateFilter({ age: 10 }, group([rule('age', 'gt', 5)]), fields), true);
});
