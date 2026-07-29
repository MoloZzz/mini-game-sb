import 'reflect-metadata';
import { hashPassword, verifyPassword } from './password.util';

describe('password hash round-trip', () => {
  it('verifies the correct password', async () => {
    const hashed = await hashPassword('correct horse battery staple');
    await expect(verifyPassword(hashed, 'correct horse battery staple')).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hashed = await hashPassword('correct horse battery staple');
    await expect(verifyPassword(hashed, 'wrong password')).resolves.toBe(false);
  });

  it('rejects a malformed hash instead of throwing', async () => {
    await expect(verifyPassword('not-a-real-hash', 'anything')).resolves.toBe(false);
  });
});
