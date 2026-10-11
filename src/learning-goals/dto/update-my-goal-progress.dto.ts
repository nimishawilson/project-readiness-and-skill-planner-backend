import { IsEnum } from 'class-validator';
import { ProgressStatus } from '../../generated/prisma/enums';

export class UpdateMyGoalProgressDto {
  @IsEnum(ProgressStatus)
  progressStatus: ProgressStatus;
}
