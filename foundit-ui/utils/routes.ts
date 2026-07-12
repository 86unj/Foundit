export const ROLES = ['student', 'security', 'admin'] as const;

export type UserRole = (typeof ROLES)[number];

/** Narrows an untrusted string (cookie, JSON) to a known role, else null. */
export function parseRole(value: string | null | undefined): UserRole | null {
  return ROLES.includes(value as UserRole) ? (value as UserRole) : null;
}

export const ROLE_HOME: Record<UserRole, string> = {
  student: '/student/dashboard',
  security: '/security/dashboard',
  admin: '/admin/dashboard',
};

/** Confirmation screen shown after a student submits a claim. */
export const CLAIM_SUBMITTED_PATH = '/student/claim-item/submitted';

/** Shared notification feed — the Notifications tab of the profile page. */
export const NOTIFICATIONS_PATH = '/profile?tab=notifications';
