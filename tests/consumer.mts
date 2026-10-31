import { createElement } from 'react';
import {
  FilterBuilder,
  createRule,
  compileFilter,
  evaluateFilter,
  operatorsFor,
  isFilterDate,
  validateFilter,
  parseFilter,
  serializeFilter,
} from '@lp-labs/react-filter-builder';
import type {
  FilterField,
  FilterGroup,
  FilterRule,
  FilterBuilderProps,
} from '@lp-labs/react-filter-builder';

type Person = { name: string; age: number };
const fields: FilterField<Person>[] = [
  { id: 'name', type: 'string', getValue: (person) => person.name },
  { id: 'age', type: 'number', getValue: (person) => person.age },
];
const group: FilterGroup = { kind: 'group', combinator: 'and', children: [createRule(fields[0])] };
const props: FilterBuilderProps<Person> = { fields, value: group, onChange: () => undefined };
createElement(FilterBuilder<Person>, props);
const predicate: (row: Person) => boolean = compileFilter(group, fields);
predicate({ name: 'Ada', age: 20 });
evaluateFilter({ name: 'Ada', age: 20 }, group, fields);
validateFilter(group, fields);
parseFilter(serializeFilter(group, fields), fields);
operatorsFor('date');
isFilterDate('2024-02-29');
// @ts-expect-error Numeric rules cannot use contains or string values.
const invalid: FilterRule = {
  kind: 'rule',
  field: 'age',
  fieldType: 'number',
  operator: 'contains',
  value: '2',
};
// @ts-expect-error Number fields must return numbers or nullish values.
const invalidField: FilterField<Person> = {
  id: 'age',
  type: 'number',
  getValue: (person) => person.name,
};
void invalid;
void invalidField;
