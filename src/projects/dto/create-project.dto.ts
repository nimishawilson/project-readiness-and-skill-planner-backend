import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { NormalizeText } from '../../common/transforms/normalize-text';
import { RequirementInputDto } from './requirement-input.dto';

export class CreateProjectDto {
  @NormalizeText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** Optional initial skill requirements; (skillId, minLevel) must be unique. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequirementInputDto)
  requirements?: RequirementInputDto[];
}
