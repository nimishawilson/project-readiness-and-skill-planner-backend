import { randomBytes } from 'crypto';

/**
 * Per-suite prefix for test data. `Date.now()` alone can collide when two
 * suites start in the same millisecond (parallel workers), which makes them
 * clash on unique columns such as `Employee.email` and delete each other's
 * rows. The random suffix has a fixed length, so no tag is a prefix of
 * another.
 */
export const uniqueTag = (prefix = 'e2e'): string =>
  `${prefix}${Date.now()}${randomBytes(3).toString('hex')}`;
