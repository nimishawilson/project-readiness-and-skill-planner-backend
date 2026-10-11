import { IsEnum } from 'class-validator';
import { ProficiencyLevel } from '../../generated/prisma/enums';

export class UpdateEmployeeSkillDto {
  @IsEnum(ProficiencyLevel)
  level: ProficiencyLevel;
}
