import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import type { CreateArchiveDossierRequest } from '@card-game/shared-types';

export class CreateArchiveDossierDto implements CreateArchiveDossierRequest {
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @IsUUID('4', { each: true })
  cardIds!: [string, string, string];
}
