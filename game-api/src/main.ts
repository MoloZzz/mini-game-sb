import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService<AppConfig, true>);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  // Reflecting any origin next to a token-issuing API is indefensible —
  // only the explicit allowlist from config may make cross-origin requests.
  app.enableCors({ origin: configService.get('corsOrigins', { infer: true }), credentials: false });

  const storageDir = configService.get('storageDir', { infer: true });
  app.useStaticAssets(storageDir, { prefix: '/static' });

  const port = configService.get('port', { infer: true });
  // Defaults to 127.0.0.1 — binding 0.0.0.0 would publish the admin API to
  // the local network.
  const apiHost = configService.get('apiHost', { infer: true });
  await app.listen(port, apiHost);
}

bootstrap();
