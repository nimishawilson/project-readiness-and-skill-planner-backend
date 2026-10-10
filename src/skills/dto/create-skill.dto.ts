import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { NormalizeText } from '../../common/transforms/normalize-text';

export class CreateSkillDto {
  @NormalizeText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;
}
