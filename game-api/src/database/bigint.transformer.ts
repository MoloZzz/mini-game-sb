import { ValueTransformer } from 'typeorm';

/**
 * TypeORM returns `bigint` columns as JS strings (bigints exceed the safe
 * integer range in general, but our economy values never will in practice).
 * Apply this to EVERY bigint column so balance arithmetic operates on
 * numbers, not strings — `'100' + '1'` is `'1001'`, not `101`.
 */
export const bigintTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null): number | null => (value === null ? null : Number(value)),
};
