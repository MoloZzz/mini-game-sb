import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/** `POST /auth/login`. */
export class LoginDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}
