import { ARCHETYPES, ELEMENTS, RARITIES } from '@card-game/shared-types';
import type { Archetype, Element, GenMeta, IngestCardInput, IngestRequest, Rarity } from '@card-game/shared-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsString,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/**
 * Relative-path guard (vault 03): `imagePath`/`thumbPath` must stay relative —
 * `CardMapper.toUrl` is the ONLY place that turns them into absolute URLs.
 * Rejects anything starting with `http://`, `https://` or a leading `/`.
 */
const RELATIVE_PATH_REGEX = /^(?!https?:\/\/)(?!\/).+$/;

/** Matches lowercase-kebab slugs, e.g. `ember-drake-a3f1`. */
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*$/;

export class IngestCardInputDto implements IngestCardInput {
  @IsString()
  @IsNotEmpty()
  @Matches(SLUG_REGEX)
  slug!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(RELATIVE_PATH_REGEX, {
    message: 'imagePath must be a relative path (no http(s):// scheme, no leading slash)',
  })
  imagePath!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(RELATIVE_PATH_REGEX, {
    message: 'thumbPath must be a relative path (no http(s):// scheme, no leading slash)',
  })
  thumbPath!: string;

  @IsIn(RARITIES)
  suggestedRarity!: Rarity;

  @IsIn(ARCHETYPES)
  archetype!: Archetype;

  @ValidateIf((_object, value) => value !== null)
  @IsIn(ELEMENTS)
  element!: Element | null;

  @IsObject()
  genMeta!: GenMeta;
}

export class IngestRequestDto implements IngestRequest {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => IngestCardInputDto)
  cards!: IngestCardInputDto[];
}
