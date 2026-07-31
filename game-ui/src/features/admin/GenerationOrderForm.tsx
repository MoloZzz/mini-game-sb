import { useId, type FormEvent, type ReactNode } from 'react';
import {
  ARCHETYPES,
  ARCHETYPE_RARITIES,
  ELEMENTS,
  type Archetype,
  type Element,
  type GenerationOrderDto,
  type Rarity,
} from '@card-game/shared-types';

import { Button } from '@/components/Button';

const NONE = '__none__';

/**
 * `setId` is deliberately absent: there is no endpoint that lists thematic
 * sets, so the field could only ever be sent as `null`. It stayed in the form
 * state that long — invisible and hardcoded — and is better re-added with a
 * real picker than kept as a dead key on every request.
 */
export interface GenerationOrderFormValue {
  title: string;
  brief: string;
  archetype: Archetype;
  element: Element | null;
  suggestedRarity: Rarity;
  candidateCount: number;
}

export const EMPTY_ORDER_FORM: GenerationOrderFormValue = {
  title: '',
  brief: '',
  archetype: 'beast',
  element: null,
  suggestedRarity: 'common',
  candidateCount: 4,
};

export function orderToFormValue(order: GenerationOrderDto): GenerationOrderFormValue {
  return {
    title: order.title,
    brief: order.brief,
    archetype: order.archetype,
    element: order.element,
    suggestedRarity: order.suggestedRarity,
    candidateCount: order.candidateCount,
  };
}

/** Switching archetype can strand the rarity outside `ARCHETYPE_RARITIES` — snap it back rather than letting the server 400. */
export function withArchetype(
  value: GenerationOrderFormValue,
  archetype: Archetype,
): GenerationOrderFormValue {
  const allowed = ARCHETYPE_RARITIES[archetype];
  return {
    ...value,
    archetype,
    suggestedRarity: allowed.includes(value.suggestedRarity) ? value.suggestedRarity : allowed[0]!,
  };
}

export interface GenerationOrderFormProps {
  value: GenerationOrderFormValue;
  onChange: (value: GenerationOrderFormValue) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel: string;
  /** Rendered next to the submit button — the edit dialog's Cancel. */
  secondaryAction?: ReactNode;
}

const FIELD_CLASSES = 'mt-1 w-full rounded border border-neutral-700 bg-neutral-950 p-2';

/** Shared by the create panel and the edit dialog, so the two cannot drift apart. */
export function GenerationOrderForm({
  value,
  onChange,
  onSubmit,
  submitting,
  submitLabel,
  secondaryAction,
}: GenerationOrderFormProps) {
  // Both copies can be mounted at once (dialog over page), so the ids have to
  // be instance-scoped or the labels would point at the wrong inputs.
  const id = useId();
  const fieldId = (name: string) => `${id}-${name}`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    onSubmit();
  };

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
      <div className="text-sm">
        <label htmlFor={fieldId('title')}>Title</label>
        <input
          id={fieldId('title')}
          required
          maxLength={80}
          value={value.title}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
          className={FIELD_CLASSES}
        />
      </div>
      <div className="text-sm">
        <label htmlFor={fieldId('candidates')}>Candidates</label>
        <select
          id={fieldId('candidates')}
          value={value.candidateCount}
          onChange={(e) => onChange({ ...value, candidateCount: Number(e.target.value) })}
          className={FIELD_CLASSES}
        >
          {[2, 3, 4, 5, 6].map((count) => (
            <option key={count}>{count}</option>
          ))}
        </select>
      </div>
      <div className="text-sm md:col-span-2">
        <label htmlFor={fieldId('brief')}>Visual brief</label>
        <textarea
          id={fieldId('brief')}
          required
          minLength={10}
          maxLength={360}
          rows={3}
          value={value.brief}
          onChange={(e) => onChange({ ...value, brief: e.target.value })}
          className={FIELD_CLASSES}
        />
      </div>
      <div className="text-sm">
        <label htmlFor={fieldId('archetype')}>Archetype</label>
        <select
          id={fieldId('archetype')}
          value={value.archetype}
          onChange={(e) => onChange(withArchetype(value, e.target.value as Archetype))}
          className={FIELD_CLASSES}
        >
          {ARCHETYPES.map((archetype) => (
            <option key={archetype}>{archetype}</option>
          ))}
        </select>
      </div>
      <div className="text-sm">
        <label htmlFor={fieldId('element')}>Element</label>
        <select
          id={fieldId('element')}
          value={value.element ?? NONE}
          onChange={(e) =>
            onChange({ ...value, element: e.target.value === NONE ? null : (e.target.value as Element) })
          }
          className={FIELD_CLASSES}
        >
          <option value={NONE}>none</option>
          {ELEMENTS.map((element) => (
            <option key={element}>{element}</option>
          ))}
        </select>
      </div>
      <div className="text-sm">
        <label htmlFor={fieldId('rarity')}>Suggested rarity</label>
        <select
          id={fieldId('rarity')}
          value={value.suggestedRarity}
          onChange={(e) => onChange({ ...value, suggestedRarity: e.target.value as Rarity })}
          className={FIELD_CLASSES}
        >
          {ARCHETYPE_RARITIES[value.archetype].map((rarity) => (
            <option key={rarity}>{rarity}</option>
          ))}
        </select>
      </div>
      <div className="flex items-end gap-2 md:col-span-2">
        <Button disabled={submitting} type="submit">
          {submitLabel}
        </Button>
        {secondaryAction}
      </div>
    </form>
  );
}
