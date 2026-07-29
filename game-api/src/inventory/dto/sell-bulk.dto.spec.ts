import 'reflect-metadata';
import { validate } from 'class-validator';
import { SellBulkRequestDto } from './sell-bulk.dto';

function makeDto(overrides: Partial<SellBulkRequestDto> = {}): SellBulkRequestDto {
  const dto = new SellBulkRequestDto();
  Object.assign(dto, overrides);
  return dto;
}

describe('SellBulkRequestDto', () => {
  it('accepts { mode: "all_duplicates" } alone', async () => {
    const errors = await validate(makeDto({ mode: 'all_duplicates' }));
    expect(errors).toHaveLength(0);
  });

  it('accepts { mode: "by_rarity", rarities: [...] }', async () => {
    const errors = await validate(makeDto({ mode: 'by_rarity', rarities: ['epic', 'legendary'] }));
    expect(errors).toHaveLength(0);
  });

  it('rejects mode "by_rarity" with no rarities', async () => {
    const errors = await validate(makeDto({ mode: 'by_rarity' }));
    expect(errors.some((e) => e.property === 'rarities')).toBe(true);
  });

  it('rejects mode "by_rarity" with an empty rarities array', async () => {
    const errors = await validate(makeDto({ mode: 'by_rarity', rarities: [] }));
    expect(errors.some((e) => e.property === 'rarities')).toBe(true);
  });

  it('rejects mode "by_rarity" with an invalid rarity value', async () => {
    const errors = await validate(
      makeDto({ mode: 'by_rarity', rarities: ['not-a-rarity'] as never }),
    );
    expect(errors.some((e) => e.property === 'rarities')).toBe(true);
  });

  it('accepts { instanceIds: [...] } with no mode at all — the third, mode-less variant', async () => {
    const errors = await validate(
      makeDto({ instanceIds: ['11111111-1111-4111-8111-111111111111'] }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects a missing mode with no instanceIds either (ambiguous, nothing to sell)', async () => {
    const errors = await validate(makeDto());
    expect(errors.some((e) => e.property === 'instanceIds')).toBe(true);
  });

  it('rejects instanceIds containing a non-UUID entry', async () => {
    const errors = await validate(makeDto({ instanceIds: ['not-a-uuid'] }));
    expect(errors.some((e) => e.property === 'instanceIds')).toBe(true);
  });

  it('rejects an unknown mode value', async () => {
    const errors = await validate(makeDto({ mode: 'everything' as never }));
    expect(errors.some((e) => e.property === 'mode')).toBe(true);
  });
});
