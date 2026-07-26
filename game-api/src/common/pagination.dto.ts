import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Offset pagination shared by every list endpoint. The global ValidationPipe
 * (`transform: true`, `enableImplicitConversion: true`) turns the query
 * strings into numbers before class-validator sees them.
 */
export class PaginationQueryDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 40;
}
