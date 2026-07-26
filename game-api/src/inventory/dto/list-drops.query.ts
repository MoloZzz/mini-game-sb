import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** `GET /me/drops?limit=20` — validated 1..100, default 20. */
export class ListDropsQueryDto {
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 20;
}
