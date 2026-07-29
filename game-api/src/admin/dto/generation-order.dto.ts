import { ARCHETYPES, ELEMENTS, RARITIES } from '@card-game/shared-types';
import type { Archetype, CompleteGenerationOrderRequest, CreateGenerationOrderRequest, Element, Rarity, SelectGenerationOrderCandidateRequest, UpdateGenerationOrderRequest } from '@card-game/shared-types';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';

export class CreateGenerationOrderDto implements CreateGenerationOrderRequest {
  @IsString() @IsNotEmpty() @MaxLength(80) title!: string;
  @IsString() @IsNotEmpty() @MaxLength(360) brief!: string;
  @IsIn(ARCHETYPES) archetype!: Archetype;
  @ValidateIf((_obj, value) => value !== null) @IsIn(ELEMENTS) element!: Element | null;
  @IsIn(RARITIES) suggestedRarity!: Rarity;
  @IsOptional() @IsInt() @Min(2) @Max(6) candidateCount?: number;
  @IsOptional() @IsUUID() setId?: string | null;
}

export class UpdateGenerationOrderDto implements UpdateGenerationOrderRequest {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) title?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(360) brief?: string;
  @IsOptional() @IsIn(ARCHETYPES) archetype?: Archetype;
  @IsOptional() @IsIn(ELEMENTS) element?: Element | null;
  @IsOptional() @IsIn(RARITIES) suggestedRarity?: Rarity;
  @IsOptional() @IsInt() @Min(2) @Max(6) candidateCount?: number;
  @IsOptional() @IsUUID() setId?: string | null;
}

export class GeneratedOrderCandidateDto {
  @IsUUID() candidateId!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) @IsString() imagePath!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) thumbPath!: string;
  @IsObject() genMeta!: Record<string, unknown>;
}

export class CompleteGenerationOrderDto implements CompleteGenerationOrderRequest {
  @IsUUID() runId!: string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => GeneratedOrderCandidateDto)
  candidates!: GeneratedOrderCandidateDto[];
}

export class FailGenerationOrderDto {
  @IsUUID() runId!: string;
  @IsString() @IsNotEmpty() @MaxLength(64) code!: string;
  @IsOptional() @IsString() @MaxLength(500) detail?: string;
}

export class SelectGenerationOrderCandidateDto implements SelectGenerationOrderCandidateRequest {
  @IsUUID() candidateId!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsOptional() @IsIn(RARITIES) rarity?: Rarity;
  @IsOptional() @IsInt() @Min(0) @Max(99) attack?: number;
  @IsOptional() @IsInt() @Min(0) @Max(99) defense?: number;
  @IsOptional() @IsString() @MaxLength(2000) flavorText?: string | null;
}
