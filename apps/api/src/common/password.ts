import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing (§2 security baseline).
 *
 * argon2id with the OWASP Password Storage Cheat Sheet's recommended second
 * configuration: 19 MiB memory, 2 iterations, 1 degree of parallelism. argon2id
 * is chosen over bcrypt because it is memory-hard, which is what actually blunts
 * GPU-accelerated cracking of a leaked hash table.
 *
 * The Rust binding is used rather than the node-gyp `argon2` package so the
 * install needs no C++ toolchain — relevant for a ministry build environment.
 *
 * These parameters are recorded in the hash string itself, so raising them later
 * does not invalidate existing hashes: old passwords keep verifying against
 * their original cost, and can be re-hashed on next successful sign-in.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, ARGON2_OPTIONS);
}

/**
 * Verifies a password against a stored hash.
 *
 * Returns false rather than throwing on a malformed or non-argon2 hash: a
 * corrupt row must read as "wrong password", never as a server error that
 * distinguishes this account from any other.
 */
export async function verifyPassword(storedHash: string, plaintext: string): Promise<boolean> {
  try {
    return await verify(storedHash, plaintext);
  } catch {
    return false;
  }
}
