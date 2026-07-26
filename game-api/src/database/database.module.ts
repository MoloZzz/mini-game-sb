import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../config/configuration';
import { ALL_ENTITIES } from '../entities';
import { InitialSchema1785017587632 } from '../migrations/1785017587632-InitialSchema';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        type: 'postgres' as const,
        url: configService.get('databaseUrl', { infer: true }),
        synchronize: false,
        logging: false,
        entities: ALL_ENTITIES,
        migrations: [InitialSchema1785017587632],
      }),
    }),
  ],
})
export class DatabaseModule {}
