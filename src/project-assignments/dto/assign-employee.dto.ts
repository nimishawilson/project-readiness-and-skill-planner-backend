import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class AssignEmployeeDto {
  @IsInt()
  @Min(1)
  employeeId: number;

  /** Assignments can only change for the current year (the default). */
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}
