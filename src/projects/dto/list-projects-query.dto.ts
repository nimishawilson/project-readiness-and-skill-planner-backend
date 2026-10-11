import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { ReadinessStatus } from '../readiness-status';

export class ListProjectsQueryDto extends PaginationQueryDto {
  /** Defaults to the current year. */
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsEnum(ReadinessStatus)
  readiness?: ReadinessStatus;

  /** Search by project name (case-insensitive). */
  @IsOptional()
  @IsString()
  q?: string;
}
