import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class MapProjectYearDto {
  /** Must be the current year or later, and after the latest mapped year. */
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;
}
