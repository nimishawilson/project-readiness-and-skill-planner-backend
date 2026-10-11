import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class MapGoalYearDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;
}
