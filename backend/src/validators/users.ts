import { z } from 'zod';

// PUT /api/users/me — replaces the user's editable profile fields.
export const replaceProfileSchema = z.object({
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  studentNumber: z
    .union([z.null(), z.coerce.number().int().min(100000000).max(999999999)])
    .optional(),
});

// PATCH /api/users/me — all fields optional but at least one must be present.
export const updateProfileSchema = z
  .object({
    firstName: z.string().min(1).max(100).trim().optional(),
    lastName: z.string().min(1).max(100).trim().optional(),
    studentNumber: z
      .union([z.null(), z.coerce.number().int().min(100000000).max(999999999)])
      .optional(),
  })
  .refine(
    (data) =>
      data.firstName !== undefined ||
      data.lastName !== undefined ||
      data.studentNumber !== undefined,
    {
      message: 'At least one field must be provided',
    }
  );

// PATCH /api/users/me/notifications
export const updateNotificationSchema = z.object({
  emailNotificationOptIn: z.boolean(),
});

// POST /api/admin/users — password and role-conditional fields (studentNumber/employeeId)
// are added in Week 4 once the login flow is implemented.
export const createUserSchema = z.object({
  email: z
    .email()
    .toLowerCase()
    .trim()
    .refine((val) => val.endsWith('@myseneca.ca'), {
      message: 'Must be a Seneca email address (@myseneca.ca)',
    }),
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  role: z.enum(['student', 'security', 'admin']),
  campusId: z.uuid(),
  // 9-digit Seneca student number (100000000–999999999)
  studentNumber: z.coerce
    .number()
    .int()
    .min(100000000)
    .max(999999999)
    .optional(),
  // Exactly 12-char employee ID per HR system constraint
  employeeId: z.string().length(12).optional(),
  phone: z
    .string()
    .regex(/^\d{10}$/)
    .optional(),
});

// GET /api/admin/users — all query params arrive as strings; coerce types explicitly.
// isActive: "true"/"false" string → boolean transform
// limit: string → number, capped at 50
export const listUsersQuerySchema = z.object({
  role: z.enum(['student', 'security', 'admin']).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  campusId: z.uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
