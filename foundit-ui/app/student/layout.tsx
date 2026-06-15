'use client';

import { usePathname } from 'next/navigation';
import { RoleShell } from '@/components/layouts/RoleShell';
import { useLoggedInDisplayName } from '@/hooks/useLoggedInDisplayName';

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const userName = useLoggedInDisplayName();

  return (
    <RoleShell variant="student" userName={userName} activePath={pathname}>
      {children}
    </RoleShell>
  );
}
