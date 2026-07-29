import { Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * Argon2id password hashing via `@node-rs/argon2` (chosen over the `argon2`
 * or `bcrypt` packages because it ships prebuilt native binaries — those two
 * need node-gyp and therefore Visual Studio Build Tools on Windows). The
 * returned PHC string embeds the algorithm/version/params it was hashed
 * with, so `verifyPassword` never needs to be told them again.
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, { algorithm: Algorithm.Argon2id });
}

/**
 * `verify()` throws on a malformed/foreign hash rather than returning
 * `false` — callers only ever want a boolean, so that case is folded into
 * "did not verify" here.
 */
export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}
