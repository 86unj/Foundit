export type ApiClaimStatus =
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'picked_up'
  | 'under_review';

export type ApiClaimNotificationPreference = 'email';

export interface ClaimImage {
  imageId: string;
  imageUrl: string;
  fileType: string;
  fileSizeKb: number;
}

export interface SecurityClaimListItem {
  claimId: string;
  studentId: string;
  itemId: string | null;
  category: string;
  itemName: string | null;
  campusId: string;
  campus: {
    campusId: string;
    campusName: string;
  };
  description: string;
  additionalInfo: string | null;
  notificationPreference: ApiClaimNotificationPreference;
  dateLost: string | null;
  locationLost: string | null;
  status: ApiClaimStatus;
  reviewedAt: string | null;
  rejectionReason: string | null;
  pickedUpAt: string | null;
  createdAt: string;
  updatedAt: string;
  student: {
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
    studentNumber: number | null;
  };
  item: {
    itemId: string;
    campusId: string;
    campus: {
      campusId: string;
      campusName: string;
    };
    category: string;
    title: string;
    status: string;
    brand: string | null;
    color: string | null;
    locationFound: string | null;
    dateFound: string;
    imageUrl: string | null;
  } | null;
  images: ClaimImage[];
}

export interface SecurityClaimDetail extends SecurityClaimListItem {
  reviewedBy: string | null;
  verifiedBy: string | null;
  reviewer: {
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  verifier: {
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export interface SecurityClaimListResponse {
  data: SecurityClaimListItem[];
  nextCursor: string | null;
}

export type MatchSuggestionStatus =
  | 'suggested'
  | 'confirmed'
  | 'rejected'
  | 'dismissed';

export interface MatchSuggestion {
  matchId: string;
  claimId: string;
  itemId: string;
  matchScore: number;
  matchCriteria: string | null;
  status: MatchSuggestionStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  item: {
    itemId: string;
    campusId: string;
    category: string;
    title: string;
    status: string;
    brand: string | null;
    color: string | null;
    locationFound: string | null;
    dateFound: string;
    descriptionPublic: string | null;
    imageUrl: string | null;
  };
  reviewer: {
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}
