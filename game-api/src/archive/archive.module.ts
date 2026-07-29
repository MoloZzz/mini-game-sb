import { Module } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module';
import { DropsModule } from '../drops/drops.module';
import { ArchiveController } from './archive.controller';
import { ArchiveService } from './archive.service';

@Module({
  imports: [CardsModule, DropsModule],
  controllers: [ArchiveController],
  providers: [ArchiveService],
})
export class ArchiveModule {}
