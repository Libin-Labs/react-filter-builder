import filter = require('@lp-labs/react-filter-builder');
import { createElement } from 'react';

const fields: filter.FilterField<{ enabled: boolean }>[] = [
  { id: 'enabled', type: 'boolean', getValue: (row) => row.enabled },
];
const group: filter.FilterGroup = {
  kind: 'group',
  combinator: 'or',
  children: [filter.createRule(fields[0])],
};
const props: filter.FilterBuilderProps<{ enabled: boolean }> = {
  fields,
  value: group,
  onChange: () => undefined,
};
createElement(filter.FilterBuilder<{ enabled: boolean }>, props);
filter.evaluateFilter(
  { enabled: false },
  filter.parseFilter(filter.serializeFilter(group, fields), fields),
  fields,
);
