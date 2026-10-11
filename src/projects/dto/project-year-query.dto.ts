import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ProjectYearQueryDto {
  /** Defaults to the current year, or the latest mapped year if not mapped to it. */
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}
