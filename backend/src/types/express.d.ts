import 'express';

declare global {
  namespace Express {
    interface Request {
      auditContext: {
        requestId: string;
        ipAddress?: string;
      };
      user?: {
        user_id: string;
        role: 'student' | 'security' | 'admin';
        // TODO: campus_id is nullable because users self-register without selecting a campus.
        // It is unclear whether campus assignment should be required at registration or done later by an admin.
        // If campus becomes required at registration, change this back to `string`.
        campus_id: string | null;
        email: string;
      };
    }
  }
}
