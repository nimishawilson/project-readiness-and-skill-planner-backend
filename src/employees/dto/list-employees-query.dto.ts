import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';

export class ListEmployeesQueryDto extends PaginationQueryDto {
  /** Search by name or email (case-insensitive). */
  @IsOptional()
  @IsString()
  q?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  departmentId?: number;
}
