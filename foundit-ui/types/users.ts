/** Shape returned by GET/PUT /api/users/me and PATCH /api/users/me/*. */
export interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  studentNumber: number | null;
  /** Resolved image URL (not the stored object key), or null when unset. */
  profilePhotoUrl: string | null;
  emailNotificationOptIn: boolean;
}
