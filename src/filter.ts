export type FieldType = 'string' | 'number' | 'date' | 'boolean';
export type EqualityOperator = 'eq' | 'neq';
export type ComparisonOperator = EqualityOperator | 'gt' | 'gte' | 'lt' | 'lte';
export type StringOperator = EqualityOperator | 'contains' | 'startsWith' | 'endsWith';
export type FilterOperator = ComparisonOperator | StringOperator;

interface FieldBase {
  id: string;
  label?: string;
}

export type FilterField<T> = FieldBase &
  (
    | { type: 'string'; getValue: (record: T) => string | null | undefined }
    | { type: 'number'; getValue: (record: T) => number | null | undefined }
    | { type: 'date'; getValue: (record: T) => string | null | undefined }
    | { type: 'boolean'; getValue: (record: T) => boolean | null | undefined }
  );

interface RuleBase {
  kind: 'rule';
  field: string;
}

export type FilterRule = RuleBase &
  (
    | { fieldType: 'string'; operator: StringOperator; value: string }
    | { fieldType: 'number'; operator: ComparisonOperator; value: number }
    | { fieldType: 'date'; operator: ComparisonOperator; value: string }
    | { fieldType: 'boolean'; operator: EqualityOperator; value: boolean }
  );

export interface FilterGroup {
  kind: 'group';
  combinator: 'and' | 'or';
  children: FilterNode[];
}

export type FilterNode = FilterRule | FilterGroup;

export interface ValidationOptions {
  maxDepth?: number;
  maxNodes?: number;
}

const operators: Record<FieldType, readonly FilterOperator[]> = {
  string: ['eq', 'neq', 'contains', 'startsWith', 'endsWith'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
  date: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
  boolean: ['eq', 'neq'],
};

export function operatorsFor(type: FieldType): readonly FilterOperator[] {
  const result = operators[type];
  if (!result) throw new TypeError('Unknown field type.');
  return [...result];
}

/** Calendar-only dates avoid timezone and locale-dependent parsing. */
export function isFilterDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function createRule<T>(field: FilterField<T>): FilterRule {
  switch (field.type) {
    case 'string':
      return { kind: 'rule', field: field.id, fieldType: 'string', operator: 'eq', value: '' };
    case 'number':
      return { kind: 'rule', field: field.id, fieldType: 'number', operator: 'eq', value: 0 };
    case 'date':
      return {
        kind: 'rule',
        field: field.id,
        fieldType: 'date',
        operator: 'eq',
        value: '1970-01-01',
      };
    case 'boolean':
      return { kind: 'rule', field: field.id, fieldType: 'boolean', operator: 'eq', value: false };
    default:
      throw new TypeError('Unknown field type.');
  }
}

function fieldMap<T>(fields: readonly FilterField<T>[]): Map<string, FilterField<T>> {
  const result = new Map<string, FilterField<T>>();
  for (const field of fields) {
    if (typeof field.id !== 'string' || !field.id.trim() || result.has(field.id)) {
      throw new TypeError('Field IDs must be nonempty and unique.');
    }
    if (
      !Object.prototype.hasOwnProperty.call(operators, field.type) ||
      typeof field.getValue !== 'function'
    ) {
      throw new TypeError('Fields need a known type and a getValue function.');
    }
    result.set(field.id, field);
  }
  return result;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Filter nodes must be objects.');
  return value as Record<string, unknown>;
}

export function validateFilter<T>(
  input: unknown,
  fields: readonly FilterField<T>[],
  options: ValidationOptions = {},
): FilterGroup {
  const registry = fieldMap(fields);
  const maxDepth = options.maxDepth ?? 20;
  const maxNodes = options.maxNodes ?? 1000;
  if (
    !Number.isInteger(maxDepth) ||
    maxDepth < 0 ||
    maxDepth > 100 ||
    !Number.isInteger(maxNodes) ||
    maxNodes < 1
  ) {
    throw new RangeError('maxDepth must be 0..100 and maxNodes must be a positive integer.');
  }
  let count = 0;
  const visit = (value: unknown, depth: number): FilterNode => {
    if (depth > maxDepth || ++count > maxNodes)
      throw new RangeError('Filter exceeds validation limits.');
    const node = object(value);
    if (node.kind === 'group') {
      if (
        (node.combinator !== 'and' && node.combinator !== 'or') ||
        !Array.isArray(node.children)
      ) {
        throw new TypeError('Groups require and/or and a children array.');
      }
      return {
        kind: 'group',
        combinator: node.combinator,
        children: node.children.map((child) => visit(child, depth + 1)),
      };
    }
    if (node.kind !== 'rule' || typeof node.field !== 'string')
      throw new TypeError('Invalid rule.');
    const field = registry.get(node.field);
    if (!field || node.fieldType !== field.type)
      throw new TypeError('Unknown field or mismatched field type.');
    if (!operators[field.type].includes(node.operator as FilterOperator))
      throw new TypeError('Operator is not valid for this field.');
    const validValue =
      field.type === 'number'
        ? typeof node.value === 'number' && Number.isFinite(node.value)
        : field.type === 'boolean'
          ? typeof node.value === 'boolean'
          : typeof node.value === 'string' && (field.type !== 'date' || isFilterDate(node.value));
    if (!validValue) throw new TypeError('Invalid rule value.');
    return {
      kind: 'rule',
      field: field.id,
      fieldType: field.type,
      operator: node.operator,
      value: node.value,
    } as FilterRule;
  };
  const root = visit(input, 0);
  if (root.kind !== 'group') throw new TypeError('The root filter must be a group.');
  return root;
}

export function serializeFilter<T>(
  value: FilterGroup,
  fields: readonly FilterField<T>[],
  options?: ValidationOptions,
): string {
  return JSON.stringify(validateFilter(value, fields, options));
}

export function parseFilter<T>(
  json: string,
  fields: readonly FilterField<T>[],
  options?: ValidationOptions,
): FilterGroup {
  return validateFilter(JSON.parse(json) as unknown, fields, options);
}

export function compileFilter<T>(
  value: FilterGroup,
  fields: readonly FilterField<T>[],
  options?: ValidationOptions,
): (record: T) => boolean {
  const root = validateFilter(value, fields, options);
  const registry = fieldMap(fields);
  const evaluate = (node: FilterNode, record: T): boolean => {
    if (node.kind === 'group') {
      return node.combinator === 'and'
        ? node.children.every((child) => evaluate(child, record))
        : node.children.some((child) => evaluate(child, record));
    }
    const actual = registry.get(node.field)!.getValue(record);
    if (actual == null) return false;
    if (node.fieldType === 'number' && (typeof actual !== 'number' || !Number.isFinite(actual)))
      return false;
    if (node.fieldType === 'boolean' && typeof actual !== 'boolean') return false;
    if ((node.fieldType === 'string' || node.fieldType === 'date') && typeof actual !== 'string')
      return false;
    if (node.fieldType === 'date' && !isFilterDate(actual as string)) return false;
    switch (node.operator) {
      case 'eq':
        return actual === node.value;
      case 'neq':
        return actual !== node.value;
      case 'contains':
        return (actual as string).includes(node.value);
      case 'startsWith':
        return (actual as string).startsWith(node.value);
      case 'endsWith':
        return (actual as string).endsWith(node.value);
      case 'gt':
        return (actual as number | string) > node.value;
      case 'gte':
        return (actual as number | string) >= node.value;
      case 'lt':
        return (actual as number | string) < node.value;
      case 'lte':
        return (actual as number | string) <= node.value;
    }
  };
  return (record) => evaluate(root, record);
}

export function evaluateFilter<T>(
  record: T,
  value: FilterGroup,
  fields: readonly FilterField<T>[],
  options?: ValidationOptions,
): boolean {
  return compileFilter(value, fields, options)(record);
}
