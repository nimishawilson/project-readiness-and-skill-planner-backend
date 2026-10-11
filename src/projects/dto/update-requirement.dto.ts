import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ProficiencyLevel } from '../../generated/prisma/enums';

export class UpdateRequirementDto {
  @IsOptional()
  @IsEnum(ProficiencyLevel)
  minLevel?: ProficiencyLevel;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  peopleRequired?: number;
}
