import { Test, TestingModule } from '@nestjs/testing';
import { POOL_TARGET_TOTAL, WINNING_INDEX } from '@card-game/shared-types';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('returns status ok with uptime and timestamp', () => {
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(typeof result.uptime).toBe('number');
    expect(typeof result.timestamp).toBe('string');
  });

  it('resolves shared-types constants correctly (proves jest<->shared-types wiring)', () => {
    expect(POOL_TARGET_TOTAL).toBe(110);
    expect(WINNING_INDEX).toBe(55);
  });
});
