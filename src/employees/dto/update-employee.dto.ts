import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { NormalizeEmail } from '../../common/transforms/normalize-email';

export class UpdateEmployeeDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
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
