export type SessionExpeditionKind = 'ashen-wastes' | 'widen-archive';

/**
 * Deliberately browser-memory-only test state. It is created only after the
 * player picks a direction, is never persisted, and is cleared by a refresh.
 */
export interface SessionExpedition {
  kind: SessionExpeditionKind;
  caseSlug: string;
}

export const ASHEN_WASTES_EXPEDITION: SessionExpedition = {
  kind: 'ashen-wastes',
  caseSlug: 'cinderbound-cache',
};

export function expeditionCollectionLabel(expedition: SessionExpedition): string {
  return expedition.kind === 'ashen-wastes' ? 'View Ashen Wastes collection' : 'View collection';
}
