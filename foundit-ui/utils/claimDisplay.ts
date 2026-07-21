import type { ApiClaimStatus, SecurityClaimListItem } from '@/types/claims';

export type ClaimDetailMode = 'awaiting' | 'review' | 'post_match' | 'terminal';

export type WorkflowStepState = 'complete' | 'active' | 'pending';

export interface ClaimWorkflowStep {
  key: string;

  label: string;

  description: string;

  state: WorkflowStepState;

  timestamp?: string | null;
}

export interface ClaimDisplayStatus {
  label: string;

  colorPalette: string;

  strip: string;

  color: string;
}

type ClaimPhaseInput = Pick<SecurityClaimListItem, 'status' | 'itemId'>;

export function claimHasLinkedItem(claim: ClaimPhaseInput): boolean {
  return Boolean(claim.itemId);
}

/** Security must confirm an AI-suggested or manually identified match. */

export function claimAwaitingMatchConfirmation(
  claim: ClaimPhaseInput
): boolean {
  return claim.status === 'under_review' && !claim.itemId;
}

/** Security can reject (close) claims that have not been picked up yet. */

export function claimCanBeClosedBySecurity(
  claim: Pick<SecurityClaimListItem, 'status'>
): boolean {
  return (
    claim.status === 'submitted' ||
    claim.status === 'under_review' ||
    claim.status === 'approved'
  );
}

export function getClaimItemName(claim: SecurityClaimListItem): string {
  const fromClaim = claim.itemName?.trim();
  if (fromClaim) {
    return fromClaim.length > 48 ? `${fromClaim.slice(0, 48)}…` : fromClaim;
  }

  if (claim.item?.title) return claim.item.title;

  return 'Lost item claim';
}

const notificationPreferenceLabels: Record<
  SecurityClaimListItem['notificationPreference'],
  string
> = {
  email: 'Email',
};

export function formatNotificationPreference(
  preference: SecurityClaimListItem['notificationPreference']
): string {
  return notificationPreferenceLabels[preference] ?? preference;
}

export function formatClaimDate(value: string | null): string {
  if (!value) return '—';

  return new Date(value).toLocaleDateString('en-CA', {
    year: 'numeric',

    month: 'short',

    day: 'numeric',
  });
}

export function formatClaimId(claimId: string): string {
  return claimId.slice(0, 8).toUpperCase();
}

const terminalDisplay: ClaimDisplayStatus = {
  label: 'Closed',

  colorPalette: 'red',

  strip: 'red.500',

  color: 'red.700',
};

const statusDisplay: Partial<
  Record<ApiClaimStatus, Omit<ClaimDisplayStatus, 'label'> & { label: string }>
> = {
  submitted: {
    label: 'Unmatched',

    colorPalette: 'gray',

    strip: 'gray.400',

    color: 'gray.600',
  },

  approved: {
    label: 'Ready for Pickup',

    colorPalette: 'orange',

    strip: 'orange.500',

    color: 'orange.700',
  },

  picked_up: {
    label: 'Complete',

    colorPalette: 'green',

    strip: 'green.500',

    color: 'green.700',
  },

  rejected: terminalDisplay,
};

export type ClaimSecurityQueue = 'action' | 'waiting' | 'closed';

/** Tells security whether they need to act, wait, or ignore. */

export function getClaimSecurityQueue(
  claim: ClaimPhaseInput
): ClaimSecurityQueue {
  const { status } = claim;

  if (status === 'picked_up' || status === 'rejected') {
    return 'closed';
  }

  if (
    status === 'approved' ||
    claimAwaitingMatchConfirmation(claim) ||
    status === 'submitted'
  ) {
    return 'action';
  }

  return 'waiting';
}

export function getClaimSecurityActionHint(claim: ClaimPhaseInput): string {
  const { status } = claim;

  if (claimAwaitingMatchConfirmation(claim)) {
    return 'Review AI matches and confirm the correct stored item.';
  }

  switch (status) {
    case 'submitted':
      return 'No item linked yet. Review matches or search stored items.';

    case 'approved':
      return 'At pickup: verify student ID, confirm ownership, and release the item.';

    case 'picked_up':
      return 'This claim is finished.';

    case 'rejected':
      return 'This claim was closed without a release.';

    default:
      return 'No action needed right now.';
  }
}

export function claimNeedsSecurityAction(claim: ClaimPhaseInput): boolean {
  return getClaimSecurityQueue(claim) === 'action';
}

/** Maps API claim status to list/detail badge labels. */

export function getClaimDisplayStatus(
  claim: ClaimPhaseInput
): ClaimDisplayStatus {
  if (claimAwaitingMatchConfirmation(claim)) {
    return {
      label: 'Match Pending',

      colorPalette: 'yellow',

      strip: 'yellow.500',

      color: 'yellow.700',
    };
  }

  const display = statusDisplay[claim.status];

  if (display) return display;

  return {
    label: 'Under Review',

    colorPalette: 'blue',

    strip: 'blue.500',

    color: 'blue.700',
  };
}

export function getClaimStatusExplanation(claim: ClaimPhaseInput): string {
  const hint = getClaimSecurityActionHint(claim);

  const queue = getClaimSecurityQueue(claim);

  if (queue === 'action') {
    return `Your action: ${hint}`;
  }

  return hint;
}

export interface ClaimCardStatus {
  label: string;

  strip: string;

  color: string;
}

/** Student-facing claim statuses (mirrors ClaimStatusProgress labels). */
export function getStudentClaimDisplayStatus(
  claim: Pick<SecurityClaimListItem, 'status'>
): ClaimDisplayStatus {
  switch (claim.status) {
    case 'submitted':
      return {
        label: 'Submitted',
        colorPalette: 'gray',
        strip: 'gray.400',
        color: 'gray.600',
      };
    case 'under_review':
      return {
        label: 'Under Review',
        colorPalette: 'blue',
        strip: 'blue.500',
        color: 'blue.700',
      };
    case 'approved':
      return {
        label: 'Match Found',
        colorPalette: 'orange',
        strip: 'orange.500',
        color: 'orange.700',
      };
    case 'picked_up':
      return {
        label: 'Completed',
        colorPalette: 'green',
        strip: 'green.500',
        color: 'green.700',
      };
    case 'rejected':
      return {
        label: 'Rejected',
        colorPalette: 'red',
        strip: 'red.500',
        color: 'red.700',
      };
  }
}

export function getClaimCardStatus(
  claim: Pick<SecurityClaimListItem, 'status'>
): ClaimCardStatus {
  const { label, strip, color } = getStudentClaimDisplayStatus(claim);

  return { label, strip, color };
}

export function getClaimDetailMode(
  claim: ClaimPhaseInput,

  suggestionCount: number
): ClaimDetailMode {
  if (claim.status === 'picked_up' || claim.status === 'rejected') {
    return 'terminal';
  }

  if (claimHasLinkedItem(claim) || claim.status === 'approved') {
    return 'post_match';
  }

  if (claimAwaitingMatchConfirmation(claim) || suggestionCount > 0) {
    return 'review';
  }

  return 'awaiting';
}

export function getClaimWorkflowSteps(
  claim: Pick<
    SecurityClaimListItem,
    'status' | 'itemId' | 'reviewedAt' | 'pickedUpAt' | 'updatedAt'
  >,

  suggestionCount: number
): ClaimWorkflowStep[] {
  const { status } = claim;

  const isPickedUp = status === 'picked_up';

  const isRejected = status === 'rejected';

  const isTerminal = isPickedUp || isRejected;

  const isApproved = status === 'approved';

  const isMatchConfirmed = claimHasLinkedItem(claim);

  const hasSuggestions =
    claimAwaitingMatchConfirmation(claim) || suggestionCount > 0;

  const matchStepState: WorkflowStepState =
    isMatchConfirmed || isApproved || isPickedUp
      ? 'complete'
      : hasSuggestions
        ? 'active'
        : 'pending';

  const readyForPickupState: WorkflowStepState =
    isPickedUp || isApproved
      ? 'complete'
      : isMatchConfirmed
        ? 'active'
        : 'pending';

  const verifyState: WorkflowStepState = isPickedUp
    ? 'complete'
    : isApproved
      ? 'active'
      : 'pending';

  const closedState: WorkflowStepState = isTerminal ? 'complete' : 'pending';

  return [
    {
      key: 'match',

      label: 'Match Found',

      description:
        isMatchConfirmed || isApproved || isPickedUp
          ? 'Stored item linked.'
          : hasSuggestions
            ? 'Review suggested matches below.'
            : 'No matches identified yet.',

      state: matchStepState,

      timestamp: isMatchConfirmed ? claim.reviewedAt : null,
    },

    {
      key: 'ready_for_pickup',

      label: 'Ready for Pickup',

      description: isPickedUp
        ? 'Student notified and item collected.'
        : isApproved
          ? 'Student notified to pick up in person.'
          : 'Student notified after match is confirmed.',

      state: readyForPickupState,

      timestamp: isApproved ? claim.reviewedAt : null,
    },

    {
      key: 'verify_release',

      label: 'Pickup',

      description: isPickedUp
        ? 'Item released to student.'
        : isApproved
          ? 'Verify student ID and release the item.'
          : 'Pending student arrival.',

      state: verifyState,

      timestamp: claim.pickedUpAt,
    },

    {
      key: 'claim_closed',

      label: isRejected ? 'Rejected' : 'Closed',

      description: isRejected
        ? 'Closed without release.'
        : isPickedUp
          ? 'Item returned to student.'
          : 'Closes after pickup or rejection.',

      state: closedState,

      timestamp: isTerminal ? claim.updatedAt : null,
    },
  ];
}

export function formatClaimDateTime(value: string | null): string {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString('en-US', {
    month: 'short',

    day: 'numeric',

    year: 'numeric',

    hour: 'numeric',

    minute: '2-digit',
  });
}

export function buildManualSearchHref(claim: SecurityClaimListItem): string {
  const params = new URLSearchParams();

  if (claim.campusId) params.set('campusId', claim.campusId);

  if (claim.category) params.set('category', claim.category);

  const trimmed = claim.description.trim();

  if (trimmed) params.set('q', trimmed.slice(0, 80));

  const query = params.toString();

  return `/security/items${query ? `?${query}` : ''}`;
}

export function matchesClaimStatusFilter(
  claim: ClaimPhaseInput,

  filter: string
): boolean {
  if (!filter) return true;

  switch (filter) {
    case 'needs_action':
      return getClaimSecurityQueue(claim) === 'action';

    case 'ready_for_pickup':
      return claim.status === 'approved';

    case 'completed':
      return getClaimSecurityQueue(claim) === 'closed';

    case 'pending':
      return getClaimSecurityQueue(claim) !== 'closed';

    case 'approved':
      return claim.status === 'approved' || claim.status === 'picked_up';

    case 'rejected':
      return claim.status === 'rejected';

    default:
      return true;
  }
}

export function isStudentClaimClosed(claim: ClaimPhaseInput): boolean {
  return claim.status === 'picked_up' || claim.status === 'rejected';
}

export function matchesStudentClaimFilter(
  claim: ClaimPhaseInput & {
    claimId: string;
    category: string;
    description: string;
    item?: { title: string } | null;
  },
  statusFilter: string,
  searchQuery: string
): boolean {
  const query = searchQuery.trim().toLowerCase();

  if (query) {
    const rawName =
      claim.item?.title?.trim() ||
      claim.description.trim() ||
      'lost item claim';
    const itemName = rawName.toLowerCase();
    const claimRef = formatClaimId(claim.claimId).toLowerCase();
    const matchesSearch =
      itemName.includes(query) ||
      claim.category.toLowerCase().includes(query) ||
      claimRef.includes(query) ||
      claim.claimId.toLowerCase().includes(query) ||
      claim.description.toLowerCase().includes(query);

    if (!matchesSearch) return false;
  }

  if (!statusFilter || statusFilter === 'all') return true;

  switch (statusFilter) {
    case 'active':
      return !isStudentClaimClosed(claim);
    case 'in_progress':
      return !isStudentClaimClosed(claim) && claim.status !== 'approved';
    case 'pickup':
      return claim.status === 'approved';
    case 'complete':
      return claim.status === 'picked_up';
    case 'closed':
      return claim.status === 'rejected';
    default:
      return true;
  }
}
