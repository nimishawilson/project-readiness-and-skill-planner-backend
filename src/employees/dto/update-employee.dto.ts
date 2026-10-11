import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { NormalizeEmail } from '../../common/transforms/normalize-email';
import { NormalizeText } from '../../common/transforms/normalize-text';

export class UpdateEmployeeDto {
  @NormalizeText()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @NormalizeEmail()
  @ValidateIf((_, value) => value !== undefined)
  @IsEmail()
  email?: string;

  /** Send `null` to clear the department. */
  @IsOptional()
  @IsInt()
  departmentId?: number | null;
}
