import { CardEntity } from './card.entity';
import { CaseOpeningEntity } from './case-opening.entity';
import { CaseEntity } from './case.entity';
import { PlayerCardEntity } from './player-card.entity';
import { PlayerMilestoneEntity } from './player-milestone.entity';
import { PlayerEntity } from './player.entity';
import { TransactionEntity } from './transaction.entity';

export { CardEntity } from './card.entity';
export { PlayerEntity } from './player.entity';
export { CaseEntity } from './case.entity';
export { CaseOpeningEntity } from './case-opening.entity';
export { PlayerCardEntity } from './player-card.entity';
export { PlayerMilestoneEntity } from './player-milestone.entity';
export { TransactionEntity } from './transaction.entity';

export const ALL_ENTITIES = [
  CardEntity,
  PlayerEntity,
  CaseEntity,
  CaseOpeningEntity,
  PlayerCardEntity,
  PlayerMilestoneEntity,
  TransactionEntity,
];
