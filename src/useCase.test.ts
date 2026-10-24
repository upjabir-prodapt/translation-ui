import { describe, expect, it } from 'vitest';
import { useCase } from './useCase';

/**
 * The entitlement list must equal the roles Apigee's gate accepts for
 * /translation/**, no more and no fewer: an extra role renders a page the gateway then
 * 403s, a missing one locks out someone the gateway would let in.
 * Platform.Admin is entitled to every vertical.
 */
describe('translation roles match the Apigee gate', () => {
  it('is entitled to exactly Translation.User and Platform.Admin', () => {
    expect([...useCase.roles].sort()).toEqual(['Translation.User', 'Platform.Admin'].sort());
  });

  it('adds no route-level role gate', () => {
    expect(useCase.routes.filter((route) => route.roles)).toEqual([]);
  });
});
