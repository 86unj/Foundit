import type { Campus, User } from '@prisma/client';

type UserWithCampus = User & {
  campus?: Pick<Campus, 'campusName'> | null;
};

export function toUserProfileResponse(user: UserWithCampus) {
  return {
    userId: user.userId,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    campusId: user.campusId,
    campusName: user.campus?.campusName ?? null,
    phone: user.phone,
    employeeId: user.employeeId,
  };
}
