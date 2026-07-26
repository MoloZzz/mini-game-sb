import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AdminCardDto,
  CardDetailResponse,
  CardDto,
  ReelTileDto,
} from '@card-game/shared-types';
import type { AppConfig } from '../config/configuration';
import type { CardEntity } from '../entities';

/**
 * THE S3 SEAM (ADR-002). `CardMapper.toUrl` is the ONLY place in this entire
 * API that turns a relative `image_path`/`thumb_path` into an absolute URL.
 * Every response that carries a card image — CardDto, CardDetailResponse,
 * AdminCardDto, ReelTileDto, CaseDto.previewCards, everything, now and in
 * every future stage — MUST go through this class. Never concatenate
 * `staticBaseUrl` with a path anywhere else. When storage moves off local
 * disk onto S3/CDN, this is the one file that changes.
 */
@Injectable()
export class CardMapper {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  /** Joins the configured static base URL with a relative path, exactly one slash between them. */
  toUrl(relativePath: string): string {
    const base = this.configService.get('staticBaseUrl', { infer: true });
    const trimmedBase = base.endsWith('/') ? base.slice(0, -1) : base;
    const trimmedPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
    return `${trimmedBase}/${trimmedPath}`;
  }

  toCardDto(card: CardEntity): CardDto {
    return {
      id: card.id,
      slug: card.slug,
      name: card.name,
      rarity: card.rarity,
      element: card.element,
      archetype: card.archetype,
      attack: card.attack,
      defense: card.defense,
      flavorText: card.flavorText,
      imageUrl: this.toUrl(card.imagePath),
      thumbUrl: this.toUrl(card.thumbPath),
    };
  }

  toCardDetail(card: CardEntity, exposeGenMeta: boolean): CardDetailResponse {
    const dto: CardDetailResponse = this.toCardDto(card);
    if (exposeGenMeta) {
      dto.genMeta = card.genMeta as CardDetailResponse['genMeta'];
    }
    return dto;
  }

  toAdminCardDto(card: CardEntity): AdminCardDto {
    return {
      ...this.toCardDto(card),
      status: card.status,
      setId: card.setId,
      genMeta: card.genMeta as AdminCardDto['genMeta'],
      createdAt: card.createdAt.toISOString(),
    };
  }

  /** Thumbs only — 60 full PNGs per opening would be ~60MB. */
  toReelTile(card: CardEntity): ReelTileDto {
    return {
      id: card.id,
      name: card.name,
      rarity: card.rarity,
      thumbUrl: this.toUrl(card.thumbPath),
    };
  }
}
