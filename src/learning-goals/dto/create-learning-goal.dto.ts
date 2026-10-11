import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { NormalizeText } from '../../common/transforms/normalize-text';

const trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

export class CreateLearningGoalDto {
  @NormalizeText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @trim()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
