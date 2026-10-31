import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

test('add/change/remove recursive rules, edit typed values, validate drafts, and reject limits', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' });
  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'HTMLInputElement',
    'Event',
  ]) {
    Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createElement: h, useState, act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { FilterBuilder, evaluateFilter, parseFilter, serializeFilter } =
    await import('../dist/esm/index.js');
  const fields = [
    { id: 'name', label: 'Name', type: 'string', getValue: (row) => row.name },
    { id: 'age', label: 'Age', type: 'number', getValue: (row) => row.age },
    { id: 'active', label: 'Active', type: 'boolean', getValue: (row) => row.active },
    { id: 'day', label: 'Day', type: 'date', getValue: (row) => row.day },
  ];
  const container = document.getElementById('root');
  const root = createRoot(container);
  let latest;
  let changes = 0;
  const errors = [];
  function App() {
    const [value, setValue] = useState({ kind: 'group', combinator: 'and', children: [] });
    latest = value;
    return h(FilterBuilder, {
      fields,
      value,
      onChange: (next) => {
        changes++;
        setValue(next);
      },
    });
  }
  const labeled = (label) => container.querySelector(`[aria-label="${label}"]`);
  const buttons = (text) =>
    [...container.querySelectorAll('button')].filter((button) => button.textContent === text);
  const select = async (label, value) => {
    await act(async () => {
      labeled(label).value = value;
      labeled(label).dispatchEvent(new window.Event('change', { bubbles: true }));
    });
  };
  const input = async (label, value) => {
    await act(async () => {
      const element = labeled(label);
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(
        element,
        value,
      );
      element.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
  };
  try {
    await act(async () => root.render(h(App)));
    await act(async () => buttons('Add rule')[0].click());
    await select('Field root.1', 'age');
    await select('Operator root.1', 'gte');
    await input('Value root.1', '18');
    assert.equal(latest.children[0].value, 18);
    const beforeInvalid = changes;
    await input('Value root.1', '');
    assert.equal(labeled('Value root.1').getAttribute('aria-invalid'), 'true');
    assert.equal(changes, beforeInvalid);
    await input('Value root.1', '21');
    await act(async () => buttons('Add group').at(-1).click());
    await select('Combinator root.2', 'or');
    await act(async () => buttons('Add rule')[0].click());
    await select('Field root.2.1', 'active');
    await select('Value root.2.1', 'true');
    assert.equal(latest.children[1].children[0].value, true);
    assert.equal(evaluateFilter({ age: 22, active: true }, latest, fields), true);
    assert.equal(evaluateFilter({ age: 22, active: false }, latest, fields), false);
    assert.deepEqual(parseFilter(serializeFilter(latest, fields), fields), latest);
    await act(async () => labeled('Remove root.1').click());
    assert.equal(latest.children.length, 1);
    await select('Field root.1.1', 'day');
    await input('Value root.1.1', '2024-02-29');
    assert.equal(latest.children[0].children[0].value, '2024-02-29');
    await act(async () =>
      root.render(
        h(FilterBuilder, {
          fields,
          value: latest,
          onChange: () => assert.fail('disabled change'),
          disabled: true,
        }),
      ),
    );
    assert.equal(container.querySelector('fieldset').disabled, true);
    await act(async () =>
      root.render(
        h(FilterBuilder, {
          fields,
          value: { kind: 'group', combinator: 'and', children: [] },
          maxNodes: 1,
          onChange: () => assert.fail('invalid emitted'),
          onError: (error) => errors.push(error),
        }),
      ),
    );
    await act(async () => buttons('Add rule')[0].click());
    assert.equal(errors.length, 1);
    assert.match(container.querySelector('[role="alert"]').textContent, /limits/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
