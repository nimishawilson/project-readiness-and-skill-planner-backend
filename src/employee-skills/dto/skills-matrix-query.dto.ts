import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class SkillsMatrixQueryDto {
  /** Limit the matrix columns to these skills (repeatable). */
  @Transform(({ value }: { value: unknown }): unknown[] =>
    (Array.isArray(value) ? (value as unknown[]) : [value]).map((v) =>
      typeof v === 'string' && v.trim() !== '' ? Number(v) : v,
    ),
  )
  @IsOptional()
  @IsInt({ each: true })
  @Min(1, { each: true })
  skillId?: number[];

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  departmentId?: number;
}
