'use client';

import { usePathname } from 'next/navigation';
import { RoleShell } from '@/components/layouts/RoleShell';
import { useLoggedInDisplayName } from '@/hooks/useLoggedInDisplayName';

export default function SecurityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const userName = useLoggedInDisplayName();

  return (
    <RoleShell variant="security" userName={userName} activePath={pathname}>
      {children}
    </RoleShell>
  );
}
