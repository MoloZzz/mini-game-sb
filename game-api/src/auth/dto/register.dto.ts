import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * `POST /auth/register`. Deliberately has no `role` field at all —
 * `AuthService.register` always assigns `'player'`; the only way to create
 * an `admin` is the offline `npm run account:bind` CLI (A7).
 */
export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  displayName!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}
