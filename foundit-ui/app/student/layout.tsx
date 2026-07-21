'use client';

import { usePathname } from 'next/navigation';
import { RoleShell } from '@/components/layouts/RoleShell';
import { useLoggedInDisplayName } from '@/hooks/useLoggedInDisplayName';

/** Routes that paint edge-to-edge (no RoleShell max-width / padding on main). */
const FULL_BLEED_PATHS = new Set(['/student/dashboard', '/student/my-claims']);

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const userName = useLoggedInDisplayName();

  return (
    <RoleShell
      variant="student"
      userName={userName}
      activePath={pathname}
      fullBleed={FULL_BLEED_PATHS.has(pathname)}
    >
      {children}
    </RoleShell>
  );
}
