import type { CardDto } from './card.js';
import type { OpenCaseResponse } from './api.js';

/** One previously undiscovered collection card can yield one Archive Note. */
export interface ArchiveNoteCardDto {
  card: CardDto;
  documented: boolean;
}

export interface ArchivePassDto {
  id: string;
  earnedAt: string;
}

/** `GET /me/archive` — task state, deliberately separate from collection progress. */
export interface ArchiveStatusDto {
  noteCards: ArchiveNoteCardDto[];
  passes: ArchivePassDto[];
}

/** `POST /me/archive/dossiers` — exactly three different owned card ids. */
export interface CreateArchiveDossierRequest {
  cardIds: [string, string, string];
}

export interface CreateArchiveDossierResponse {
  pass: ArchivePassDto;
  documentedCardIds: string[];
}

/** `POST /me/archive/passes/:passId/open` returns the normal server-authoritative reveal. */
export type OpenArchivePassResponse = OpenCaseResponse;
