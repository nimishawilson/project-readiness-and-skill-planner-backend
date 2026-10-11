import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NormalizeEmail } from '../../common/transforms/normalize-email';
import { NormalizeText } from '../../common/transforms/normalize-text';

export class CreateEmployeeDto {
  @NormalizeText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @NormalizeEmail()
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsInt()
  departmentId: number;
}
