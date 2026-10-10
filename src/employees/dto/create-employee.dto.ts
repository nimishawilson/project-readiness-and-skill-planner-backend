import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';
import { NormalizeEmail } from '../../common/transforms/normalize-email';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
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
