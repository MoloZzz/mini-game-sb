import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { PlayerDto } from '@card-game/shared-types';
import { AuthService } from './auth.service';
import { CurrentPlayer } from './decorators/current-player.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthResponse, CurrentPlayerPayload } from './types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body() body: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(body);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto): Promise<AuthResponse> {
    return this.authService.login(body);
  }

  // The global APP_GUARD already covers this route; the explicit guard is kept
  // as a local statement of intent, since the two sibling routes above are
  // @Public() and this one deliberately is not.
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentPlayer() currentPlayer: CurrentPlayerPayload): Promise<PlayerDto> {
    return this.authService.getPlayerDto(currentPlayer.id);
  }
}
