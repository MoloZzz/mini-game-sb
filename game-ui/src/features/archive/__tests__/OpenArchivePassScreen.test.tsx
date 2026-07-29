import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { db, resetDb } from '@/mocks/db';
import { server } from '@/mocks/server';

vi.mock('@/features/reel/Reel', () => ({
  Reel: ({ onLanded }: { onLanded: () => void }) => <button type="button" onClick={onLanded}>Finish reel</button>,
}));

vi.mock('@/features/reveal/Reveal', () => ({
  Reveal: ({ againLabel, onAgain }: { againLabel?: string; onAgain: () => void }) => (
    <button type="button" onClick={onAgain}>{againLabel}</button>
  ),
}));

import { OpenArchivePassScreen } from '../OpenArchivePassScreen';

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  resetDb();
});
afterAll(() => server.close());

describe('OpenArchivePassScreen', () => {
  it('consumes a pass only after the player explicitly opens the Archive Cache', async () => {
    const user = userEvent.setup();
    const onBackToArchive = vi.fn();
    db.archivePasses.push({ id: 'pass-1', earnedAt: new Date().toISOString() });
    render(<OpenArchivePassScreen passId="pass-1" onBackToArchive={onBackToArchive} onToInventory={() => {}} />);

    expect(db.archivePasses).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /open archive cache/i }));
    await waitFor(() => expect(db.archivePasses).toHaveLength(0));
    await user.click(await screen.findByRole('button', { name: /finish reel/i }));
    await user.click(await screen.findByRole('button', { name: /back to archive notes/i }));
    expect(onBackToArchive).toHaveBeenCalledOnce();
  });
});
