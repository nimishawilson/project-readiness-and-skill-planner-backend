import { ApiProperty } from '@nestjs/swagger';
import { SkillDto } from '../../skills/dto/skill.dto';
import { ProficiencyLevel } from '../../generated/prisma/enums';

export class SkillsMatrixRowDto {
  id: number;
  name: string;

  /** Level per skill id; a missing key means the employee lacks that skill. */
  @ApiProperty({
    type: 'object',
    additionalProperties: { enum: Object.values(ProficiencyLevel) },
    example: { '1': 'BEGINNER' },
  })
  levels: Record<string, ProficiencyLevel>;
}

export class SkillsMatrixDto {
  skills: SkillDto[];
  employees: SkillsMatrixRowDto[];
}
