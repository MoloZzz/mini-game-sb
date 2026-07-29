import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MOCK_CARDS } from '@/mocks/fixtures/cards';
import { db, resetDb } from '@/mocks/db';
import { server } from '@/mocks/server';

import { ArchiveNotesPage } from '../ArchiveNotesPage';

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  resetDb();
});
afterAll(() => server.close());

function ownedCards() {
  const ids = [...new Set(db.ownedInstances.map((instance) => instance.cardId))];
  return ids.map((id) => MOCK_CARDS.find((card) => card.id === id)!);
}

function cardButton(name: string) {
  return screen.getByRole('button', { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
}

describe('ArchiveNotesPage', () => {
  it('requires exactly three undocumented cards before creating a dossier', async () => {
    const user = userEvent.setup();
    render(<ArchiveNotesPage onOpenPass={() => {}} />);

    const [first, second, third, fourth] = ownedCards();
    await screen.findByText(/build a dossier/i);
    const create = screen.getByRole('button', { name: /create dossier/i });
    expect(create).toBeDisabled();

    await user.click(cardButton(first!.name));
    await user.click(cardButton(second!.name));
    await user.click(cardButton(third!.name));
    expect(create).toBeEnabled();
    expect(cardButton(fourth!.name)).toBeDisabled();

    await user.click(create);
    await screen.findByText(/^archive pass$/i);
    expect(cardButton(first!.name)).toBeDisabled();
    expect(screen.getByText(/0 of 3 cards selected/i)).toBeInTheDocument();
  });

  it('does not let a documented card join a dossier selection', async () => {
    const [documented] = ownedCards();
    db.documentedCardIds.push(documented!.id);
    render(<ArchiveNotesPage onOpenPass={() => {}} />);

    await screen.findByText(/build a dossier/i);
    expect(cardButton(documented!.name)).toBeDisabled();
    expect(screen.getByText('DOCUMENTED')).toBeInTheDocument();
  });

  it('opens a newly earned pass through the explicit Archive Cache action', async () => {
    const user = userEvent.setup();
    const onOpenPass = vi.fn();
    render(<ArchiveNotesPage onOpenPass={onOpenPass} />);

    const [first, second, third] = ownedCards();
    await screen.findByText(/build a dossier/i);
    await user.click(cardButton(first!.name));
    await user.click(cardButton(second!.name));
    await user.click(cardButton(third!.name));
    await user.click(screen.getByRole('button', { name: /create dossier/i }));

    const open = await screen.findByRole('button', { name: /open archive cache/i });
    await user.click(open);
    await waitFor(() => expect(onOpenPass).toHaveBeenCalledWith(expect.any(String)));
  });
});
