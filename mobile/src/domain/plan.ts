/** Days left in the trial (rounded up), or 0 when the user is not on a running trial. */
export function trialDaysLeft(
  user: { tier?: string; trialEndsAt?: string | null } | null | undefined,
  now = Date.now(),
): number {
  if (!user || user.tier !== 'trial' || !user.trialEndsAt) return 0;
  const end = Date.parse(user.trialEndsAt);
  if (!Number.isFinite(end) || end <= now) return 0;
  return Math.max(1, Math.ceil((end - now) / (24 * 60 * 60 * 1000)));
}
