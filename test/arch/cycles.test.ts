/**
 * Fitness function: no circular dependencies between subsystems (ADR-012).
 *
 * Assigns every src file to its top-level subsystem and asserts there is no
 * import cycle between those subsystems. Cyclic coupling is the classic
 * "architecture erosion" signal the book's beFreeOfCycles() rule guards against.
 *
 * Uses assignedFrom() with globstar-prefixed folder globs (matched against
 * absolute paths). A slice-prefix matching form was found to slice vacuously
 * during ADR-012 verification, so explicit named slices are used instead.
 */
import path from 'node:path';
import { describe, it } from 'vitest';
import { project, slices } from '@nielspeter/ts-archunit';

const tsconfigPath = path.resolve(import.meta.dirname, '../../tsconfig.json');
const p = project(tsconfigPath);

const subsystems = {
  lib: '**/lib/**',
  content: '**/content/**',
  background: '**/background/**',
  popup: '**/popup/**',
  offscreen: '**/offscreen/**',
};

describe('architecture: cycles', () => {
  it('src subsystems must be free of dependency cycles', () => {
    slices(p)
      .assignedFrom(subsystems)
      .should()
      .beFreeOfCycles()
      .because('circular coupling between subsystems erodes the architecture')
      .check();
  });
});
