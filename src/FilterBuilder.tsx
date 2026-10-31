import { useState } from 'react';
import type { ReactElement } from 'react';
import { createRule, isFilterDate, operatorsFor, validateFilter } from './filter.js';
import type {
  FilterField,
  FilterGroup,
  FilterNode,
  FilterRule,
  ValidationOptions,
} from './filter.js';

export interface FilterBuilderProps<T> extends ValidationOptions {
  fields: readonly FilterField<T>[];
  value: FilterGroup;
  onChange: (value: FilterGroup) => void;
  onError?: (error: Error) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

interface RuleValueProps {
  rule: FilterRule;
  disabled: boolean;
  label: string;
  onChange: (value: FilterRule) => void;
}

function RuleValue({ rule, disabled, label, onChange }: RuleValueProps) {
  const [draft, setDraft] = useState(String(rule.value));
  const [previous, setPrevious] = useState(rule.value);
  const [invalid, setInvalid] = useState(false);
  if (previous !== rule.value) {
    setPrevious(rule.value);
    setDraft(String(rule.value));
    setInvalid(false);
  }
  if (rule.fieldType === 'boolean') {
    return (
      <select
        aria-label={label}
        disabled={disabled}
        value={String(rule.value)}
        onChange={(event) => onChange({ ...rule, value: event.target.value === 'true' })}
      >
        <option value="false">False</option>
        <option value="true">True</option>
      </select>
    );
  }
  return (
    <input
      aria-label={label}
      aria-invalid={invalid || undefined}
      title={invalid ? 'Enter a finite number or a valid YYYY-MM-DD date.' : undefined}
      type={rule.fieldType === 'date' ? 'date' : rule.fieldType === 'number' ? 'number' : 'text'}
      step={rule.fieldType === 'number' ? 'any' : undefined}
      disabled={disabled}
      value={draft}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        if (rule.fieldType === 'number') {
          const number = Number(text);
          const valid = text.trim() !== '' && Number.isFinite(number);
          setInvalid(!valid);
          if (valid) onChange({ ...rule, value: number });
        } else if (rule.fieldType === 'date') {
          const valid = isFilterDate(text);
          setInvalid(!valid);
          if (valid) onChange({ ...rule, value: text });
        } else {
          setInvalid(false);
          onChange({ ...rule, value: text });
        }
      }}
    />
  );
}

export function FilterBuilder<T>({
  fields,
  value,
  onChange,
  onError,
  disabled = false,
  className = '',
  maxDepth = 20,
  maxNodes = 1000,
  'aria-label': label = 'Filter builder',
}: FilterBuilderProps<T>) {
  const root = validateFilter(value, fields, { maxDepth, maxNodes });
  const [error, setError] = useState('');
  const commit = (next: FilterGroup) => {
    let validated: FilterGroup;
    try {
      validated = validateFilter(next, fields, { maxDepth, maxNodes });
    } catch (cause) {
      const failure = cause instanceof Error ? cause : new Error(String(cause));
      setError(failure.message);
      onError?.(failure);
      return;
    }
    setError('');
    onChange(validated);
  };
  const renderGroup = (
    group: FilterGroup,
    path: string,
    depth: number,
    update: (next: FilterGroup) => void,
  ): ReactElement => (
    <fieldset className="lp-filter-group" key={path} disabled={disabled}>
      <legend>{path === 'root' ? 'Filter' : `Group ${path}`}</legend>
      <label>
        Match
        <select
          aria-label={`Combinator ${path}`}
          value={group.combinator}
          onChange={(event) => update({ ...group, combinator: event.target.value as 'and' | 'or' })}
        >
          <option value="and">All (AND)</option>
          <option value="or">Any (OR)</option>
        </select>
      </label>
      {group.children.map((node, index) => {
        const childPath = `${path}.${index + 1}`;
        const replace = (next: FilterNode) =>
          update({
            ...group,
            children: group.children.map((child, childIndex) =>
              childIndex === index ? next : child,
            ),
          });
        return (
          <div className="lp-filter-node" key={childPath}>
            {node.kind === 'group' ? (
              renderGroup(node, childPath, depth + 1, replace)
            ) : (
              <div className="lp-filter-rule">
                <select
                  aria-label={`Field ${childPath}`}
                  value={node.field}
                  onChange={(event) =>
                    replace(createRule(fields.find((field) => field.id === event.target.value)!))
                  }
                >
                  {fields.map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.label ?? field.id}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`Operator ${childPath}`}
                  value={node.operator}
                  onChange={(event) =>
                    replace({ ...node, operator: event.target.value } as FilterRule)
                  }
                >
                  {operatorsFor(node.fieldType).map((operator) => (
                    <option key={operator} value={operator}>
                      {operator}
                    </option>
                  ))}
                </select>
                <RuleValue
                  key={`${node.field}:${node.fieldType}`}
                  rule={node}
                  disabled={disabled}
                  label={`Value ${childPath}`}
                  onChange={replace}
                />
              </div>
            )}
            <button
              type="button"
              aria-label={`Remove ${childPath}`}
              onClick={() =>
                update({
                  ...group,
                  children: group.children.filter((_, childIndex) => childIndex !== index),
                })
              }
            >
              Remove
            </button>
          </div>
        );
      })}
      <div className="lp-filter-actions">
        <button
          type="button"
          disabled={!fields.length || depth >= maxDepth}
          onClick={() => update({ ...group, children: [...group.children, createRule(fields[0])] })}
        >
          Add rule
        </button>
        <button
          type="button"
          disabled={depth >= maxDepth}
          onClick={() =>
            update({
              ...group,
              children: [...group.children, { kind: 'group', combinator: 'and', children: [] }],
            })
          }
        >
          Add group
        </button>
      </div>
    </fieldset>
  );
  return (
    <section className={`lp-filter ${className}`} aria-label={label}>
      {renderGroup(root, 'root', 0, commit)}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
