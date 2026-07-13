'use client';

import { Box } from '@chakra-ui/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { NotificationsProvider } from '@/components/NotificationsProvider';

interface RoleShellProps {
  variant: 'student' | 'security';
  userName?: string;
  activePath?: string;
  /** Skip main max-width/padding so pages can paint edge-to-edge. */
  fullBleed?: boolean;
  children: React.ReactNode;
}

export function RoleShell({
  variant,
  userName,
  activePath,
  fullBleed = false,
  children,
}: RoleShellProps) {
  return (
    <NotificationsProvider>
      <Box
        minH="100vh"
        bg="gray.50"
        display="flex"
        flexDirection="column"
        overflowX="clip"
      >
        <Navbar variant={variant} userName={userName} activePath={activePath} />
        <Box
          as="main"
          flex={1}
          w="full"
          display="flex"
          flexDirection="column"
          {...(fullBleed
            ? {}
            : {
                maxW: '1200px',
                mx: 'auto',
                px: { base: 4, md: 8 },
                py: { base: 8, md: 10 },
              })}
        >
          {children}
        </Box>
        <Footer />
      </Box>
    </NotificationsProvider>
  );
}
