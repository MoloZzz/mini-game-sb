import { HttpException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { CardMapper } from '../cards/card.mapper';
import type { DropsService } from '../drops/drops.service';
import { ArchiveService } from './archive.service';

function buildService(overrides: {
  dataSource?: Partial<DataSource>;
  cardMapper?: Partial<CardMapper>;
  dropsService?: Partial<DropsService>;
} = {}) {
  const dataSource = (overrides.dataSource ?? {}) as DataSource;
  return new ArchiveService(
    dataSource,
    (overrides.cardMapper ?? {}) as CardMapper,
    (overrides.dropsService ?? {}) as DropsService,
  );
}

describe('ArchiveService.createDossier', () => {
  it('rejects a duplicate card id before it can start a transaction', async () => {
    const transaction = jest.fn();
    const service = buildService({ dataSource: { transaction } });

    await expect(service.createDossier('player-1', ['a', 'a', 'b'])).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ARCHIVE_INVALID_DOSSIER' }),
    } as Partial<HttpException>);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('creates one dossier, three notes and one unconsumed pass without altering cards', async () => {
    const save = jest
      .fn()
      .mockResolvedValueOnce({ id: 'dossier-1' })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ id: 'pass-1', earnedAt: new Date('2026-07-29T00:00:00.000Z') });
    const manager = {
      createQueryBuilder: () => ({
        setLock: () => ({ where: () => ({ getOne: jest.fn().mockResolvedValue({ id: 'player-1' }) }) }),
      }),
      find: jest.fn().mockResolvedValueOnce([
        { cardId: 'a' }, { cardId: 'b' }, { cardId: 'c' },
      ]).mockResolvedValueOnce([]),
      create: (_entity: unknown, value: unknown) => value,
      save,
    };
    const transaction = jest.fn(async (work: (value: typeof manager) => unknown) => work(manager));
    const service = buildService({ dataSource: { transaction } });

    await expect(service.createDossier('player-1', ['a', 'b', 'c'])).resolves.toEqual({
      pass: { id: 'pass-1', earnedAt: '2026-07-29T00:00:00.000Z' },
      documentedCardIds: ['a', 'b', 'c'],
    });
    expect(manager.find).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledTimes(3);
  });
});

describe('ArchiveService.openPass', () => {
  it('delegates to the single server-authoritative pass-opening path', async () => {
    const openArchivePass = jest.fn().mockResolvedValue({ dropId: 'drop-1' });
    const service = buildService({ dropsService: { openArchivePass } });

    await expect(service.openPass('player-1', 'pass-1', 'seed', 'idem')).resolves.toEqual({ dropId: 'drop-1' });
    expect(openArchivePass).toHaveBeenCalledWith('player-1', 'pass-1', 'seed', 'idem');
  });
});
