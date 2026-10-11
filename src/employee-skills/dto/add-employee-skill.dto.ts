import { Type } from 'class-transformer';
import { IsEnum, IsInt, Min } from 'class-validator';
import { ProficiencyLevel } from '../../generated/prisma/enums';

export class AddEmployeeSkillDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  skillId: number;

  @IsEnum(ProficiencyLevel)
  level: ProficiencyLevel;
}
