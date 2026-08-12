import type { AppNotification } from '@/types/notifications';
import { buildSecurityItemsHref } from '@/utils/claimDisplay';
import type { UserRole } from '@/utils/routes';

/**
 * Resolves where a notification card should navigate on open.
 * Returns null when there is no useful destination for the role.
 */
export function getNotificationHref(
  notification: Pick<AppNotification, 'type' | 'referenceType' | 'referenceId'>,
  role: UserRole | null
): string | null {
  // Batched retention notices have no single item id — open the expired filter.
  if (notification.type === 'item_expiring') {
    if (role === 'security' || role === 'admin') {
      return buildSecurityItemsHref({ status: 'expired' });
    }
    return null;
  }

  const { referenceType, referenceId } = notification;
  if (!referenceType || !referenceId) {
    return null;
  }

  if (referenceType === 'claim') {
    if (role === 'student') {
      return `/student/my-claims?claimId=${encodeURIComponent(referenceId)}`;
    }
    if (role === 'security' || role === 'admin') {
      return `/security/claims/${encodeURIComponent(referenceId)}`;
    }
    return null;
  }

  if (referenceType === 'item') {
    if (role === 'security' || role === 'admin') {
      return `/security/items/${encodeURIComponent(referenceId)}`;
    }
    return null;
  }

  return null;
}
