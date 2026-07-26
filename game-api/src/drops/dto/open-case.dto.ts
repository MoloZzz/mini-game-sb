import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { OpenCaseRequest } from '@card-game/shared-types';

export class OpenCaseRequestDto implements OpenCaseRequest {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientSeed?: string;
}
