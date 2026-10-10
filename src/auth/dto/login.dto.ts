import { NormalizeEmail } from '../../common/transforms/normalize-email';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @NormalizeEmail()
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
