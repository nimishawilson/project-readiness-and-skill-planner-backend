import { IsEnum, IsInt, Max, Min } from 'class-validator';
import { ProficiencyLevel } from '../../generated/prisma/enums';

export class RequirementInputDto {
  @IsInt()
  @Min(1)
  skillId: number;

  @IsEnum(ProficiencyLevel)
  minLevel: ProficiencyLevel;

  /** People needed at (or above) the minimum level. */
  @IsInt()
  @Min(1)
  @Max(1000)
  peopleRequired: number;
}
