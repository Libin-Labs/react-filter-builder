# @lp-labs/react-filter-builder

Package version: `0.1.0`.

An original, standalone React rule editor and pure, validated recursive filter
engine. Zero runtime dependencies; React is a peer. Both ESM and CommonJS
ship matching TypeScript declarations. No expression strings are executed.

## Install

```sh
npm install @lp-labs/react-filter-builder react
```

Use React `^18.2.0 || ^19.0.0` and a compatible renderer. Import optional CSS
explicitly.

```tsx
import { useMemo, useState } from "react";
import {
  FilterBuilder, compileFilter, serializeFilter, parseFilter,
} from "@lp-labs/react-filter-builder";
import type { FilterField, FilterGroup } from "@lp-labs/react-filter-builder";
import "@lp-labs/react-filter-builder/styles.css";

type Person = { name: string; age: number; active: boolean; joined: string };
const fields: FilterField<Person>[] = [
  { id: "name", label: "Name", type: "string", getValue: (person) => person.name },
  { id: "age", label: "Age", type: "number", getValue: (person) => person.age },
  { id: "active", label: "Active", type: "boolean", getValue: (person) => person.active },
  { id: "joined", label: "Joined", type: "date", getValue: (person) => person.joined },
];
const initial: FilterGroup = {
  kind: "group",
  combinator: "and",
  children: [
    { kind: "rule", field: "age", fieldType: "number", operator: "gte", value: 18 },
    {
      kind: "group", combinator: "or", children: [
        { kind: "rule", field: "name", fieldType: "string", operator: "startsWith", value: "A" },
        { kind: "rule", field: "active", fieldType: "boolean", operator: "eq", value: true },
      ],
    },
  ],
};

export function PeopleSearch({ people }: { people: Person[] }) {
  const [filter, setFilter] = useState(initial);
  const matches = useMemo(() => people.filter(compileFilter(filter, fields)), [people, filter]);
  return (
    <>
      <FilterBuilder fields={fields} value={filter} onChange={setFilter} />
      <p>{matches.length} matches</p>
      <pre>{serializeFilter(filter, fields)}</pre>
    </>
  );
}

const saved = serializeFilter(initial, fields);
const restored = parseFilter<Person>(saved, fields);
```

Persist `onChange` into `value`. All updates are immutable proposals.
Accessors are typed functions, including ordinary nested-property access;
there is no dynamic code, property-path parser, SQL generator, or server call.

## Data types

All types below are exported:

- `FieldType = "string" | "number" | "date" | "boolean"`.
- `EqualityOperator = "eq" | "neq"`.
- `ComparisonOperator = EqualityOperator | "gt" | "gte" | "lt" | "lte"`.
- `StringOperator = EqualityOperator | "contains" | "startsWith" | "endsWith"`.
- `FilterOperator` is the union of comparison and string operators.
- `FilterField<T>` has `id: string`, optional `label: string`, a `type`
  discriminator, and a typed `getValue(record: T)`. String/date fields return
  `string | null | undefined`, number fields return `number | null | undefined`,
  and boolean fields return `boolean | null | undefined`.
- `FilterRule` has `kind: "rule"`, `field: string`, and a discriminated
  `fieldType`/`operator`/`value` combination from the table below.
- `FilterGroup` has `kind: "group"`, `combinator: "and" | "or"`, and
  `children: FilterNode[]`.
- `FilterNode = FilterRule | FilterGroup`.
- `ValidationOptions = { maxDepth?: number; maxNodes?: number }`.
- `FilterBuilderProps<T>` is documented below.

| `fieldType` | `operator` | `value` |
| --- | --- | --- |
| `string` | `eq`, `neq`, `contains`, `startsWith`, `endsWith` | string |
| `number` | `eq`, `neq`, `gt`, `gte`, `lt`, `lte` | finite number |
| `date` | `eq`, `neq`, `gt`, `gte`, `lt`, `lte` | valid `YYYY-MM-DD` string |
| `boolean` | `eq`, `neq` | boolean |

Field IDs are runtime-validated against your field definitions; arbitrary
string IDs are not inferred as a compile-time literal schema. The rule union
does enforce operator/value compatibility with its declared `fieldType`.

## Pure helpers

All generic helpers below receive `fields: readonly FilterField<T>[]`.

- `validateFilter<T>(input: unknown, fields, options?): FilterGroup` validates
  and returns a detached canonical tree, dropping unrecognized properties.
- `parseFilter<T>(json: string, fields, options?): FilterGroup` parses JSON
  then validates it.
- `serializeFilter<T>(value: FilterGroup, fields, options?): string` validates
  then emits compact JSON. Only data is serialized, not field accessors.
- `compileFilter<T>(value: FilterGroup, fields, options?): (record: T) => boolean`
  validates/copies the tree once, then returns a short-circuiting predicate.
  Prefer this for arrays. Subsequent mutation of the original tree does not
  alter the compiled tree; keep the field definitions/accessors immutable.
- `evaluateFilter<T>(record: T, value: FilterGroup, fields, options?): boolean`
  validates each call. Useful for single-record checks.
- `operatorsFor(type: FieldType): readonly FilterOperator[]` returns a fresh
  operator list in editor order.
- `createRule<T>(field: FilterField<T>): FilterRule` creates `eq` with `""`,
  `0`, `"1970-01-01"`, or `false` according to type.
- `isFilterDate(value: string): boolean` checks a real calendar date with
  exactly four year digits and two month/day digits.

### Evaluation policy

AND of zero children is true; OR of zero children is false. Strings use
case-sensitive JavaScript literal comparisons and substring operations, not
regular expressions, locale folding, trimming, or Unicode normalization.
An empty substring matches every valid string. Numbers are compared without
string coercion or rounding.

Dates are date-only ISO calendar strings (years `0000` through `9999`); invalid
days and timestamps are rejected. Valid dates compare lexicographically,
equivalent to chronological date-only order. There is no local timezone,
clock, `Date` object coercion, or locale-dependent parsing.

Missing/null or wrongly typed record values return **false for every rule,
including `neq`**. Invalid record numbers/dates also return false. Boolean
strings do not become booleans. Caller accessors should be deterministic;
exceptions they throw propagate.

### Validation and errors

Definitions need unique nonempty IDs, a known type, and a function accessor.
The root must be a group. Unknown fields, mismatched field types, unsupported
operators/combinators, nonfinite numeric literals, invalid dates, and invalid
tree shapes throw `TypeError`. Bad JSON throws `SyntaxError`.

`maxDepth` defaults to `20` with the root at depth `0`; allowed values are
integers `0..100`. `maxNodes` defaults to `1000` and must be a positive
integer, counting groups and rules including the root. Invalid options,
exceeded limits, and cycles that exceed those limits throw `RangeError`.
Limits bound traversal, not incoming JSON string length: cap untrusted input
size before calling `parseFilter`.

## FilterBuilderProps&lt;T&gt;

| Prop | Default | Contract |
| --- | --- | --- |
| `fields` | required | Readonly field definitions |
| `value` | required | Valid root `FilterGroup` |
| `onChange(value: FilterGroup)` | required | Validated replacement tree |
| `onError(error: Error)` | absent | Rejected editor operations, e.g. node limit |
| `maxDepth` | `20` | Shared validation/editor nesting bound |
| `maxNodes` | `1000` | Shared validation bound |
| `disabled` | `false` | Disable editing using native fieldsets |
| `className` | `""` | Extra root class |
| `aria-label` | `"Filter builder"` | Root section label |

Groups expose AND/OR, Add rule, Add group, and removal for each child.
Add rule uses the first field; it is disabled with no fields. Root removal
is not provided. Changing a rule's field resets its operator/value to that
field's defaults. Rules have field/operator selects and string, numeric,
date, or boolean controls. Group/rule position labels identify nested
controls (for example `Value root.2.1`).

Incomplete numeric/date drafts remain local to the input, set `aria-invalid`,
and do **not** emit invalid trees; the parent keeps the last valid value.
Changing to another field resets the draft. A valid external value change
resynchronizes it. Validation errors on adding/editing show an alert and
call `onError`; malformed incoming props throw during render instead.
Consumer callback exceptions propagate. Use an application error boundary
when loading external filters.

## Styles and accessibility

Optional CSS scopes to `.lp-filter`, `.lp-filter-group`, `.lp-filter-node`,
`.lp-filter-rule`, and `.lp-filter-actions`. Override `--lp-filter-border`
and `--lp-filter-accent` on a custom `className`, or supply your own styles:

```css
.search-filter { --lp-filter-accent: #6d28d9; }
```

Native fieldsets/legends express groups; labeled selects/inputs, native
buttons, visible focus, invalid-state attributes, and error alerts support
keyboard and assistive-technology use. There is no custom tree keyboard
model, drag reordering, or automatic focus transfer after removal. Position
labels change when siblings are removed. Check your final labels/contrast
and test the editor in your target browser and screen reader.

## Bounds

Only the documented literal operators are supported. There is no regex,
negated group, null operator, list membership, range editor, datetime,
async field lookup, authorization policy, or persistence layer. Filtering
is synchronous and in memory; tree depth/node limits are intentional.
Do not treat client-side filtering as server authorization or validated
SQL. No production certification or universal accessibility compatibility
is claimed.

## License

[MIT](./LICENSE).

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
