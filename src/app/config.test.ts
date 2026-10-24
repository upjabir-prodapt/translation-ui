import { describe, expect, it } from 'vitest';
import { APP_DESCRIPTOR, APP_ROLES, APP_SLUG } from './config';

/**
 * The entitlement list must equal the roles Apigee's gate accepts for
 * /translation/**, no more and no fewer: an extra role renders a page the gateway then
 * 403s, a missing one locks out someone the gateway would let in.
 * Platform.Admin is entitled to every vertical.
 */
describe('translation roles match the Apigee gate', () => {
  it('is entitled to exactly Translation.User and Platform.Admin', () => {
    expect([...APP_ROLES].sort()).toEqual(['Translation.User', 'Platform.Admin'].sort());
  });

  it('gives the platform the same slug and roles the routes are gated on', () => {
    expect(APP_DESCRIPTOR.slug).toBe(APP_SLUG);
    expect(APP_DESCRIPTOR.roles).toBe(APP_ROLES);
    expect(APP_DESCRIPTOR.hub?.name).toBe('Translation');
  });
});
