'use client';

/**
 * Navbar — sticky top navigation bar.
 *
 * Variants:
 *   'guest'    — not logged in; no username, shows Login button.
 *   'student'  — authenticated student; shows Home, My Claims + user dropdown.
 *   'security' — authenticated security staff; shows Home, Items, Claims + user dropdown.
 *
 * Data shape:
 *   The parent calls GET /api/users/me (returns NavUser), then passes
 *   userName={`${user.firstName} ${user.lastName}`} down to this component.
 *   (@see NavUser type exported below)
 *
 * Active-link detection: uses Next.js `usePathname`.
 *   (@see https://nextjs.org/docs/app/api-reference/functions/use-pathname)
 *
 * User dropdown: Chakra UI v3 Menu.
 *   (@see https://www.chakra-ui.com/docs/components/menu)
 *
 * Usage:
 *   // Guest (standalone page)
 *   <Navbar variant="guest" />
 *
 *   // Authenticated — activePath threaded from the layout
 *   const pathname = usePathname();
 *   <Navbar variant="student" userName="Jane Smith" activePath={pathname} />
 *   <Navbar variant="security" userName="Officer Reyes" activePath={pathname} />
 *
 *   // Via RoleShell (recommended for role-based layouts)
 *   <RoleShell variant="student" userName={displayName} activePath={pathname}>
 *     {children}
 *   </RoleShell>
 */

import {
  Box,
  Button as ChakraButton,
  Circle,
  Flex,
  HStack,
  IconButton,
  Image,
  Link,
  Menu,
  Text,
  VStack,
} from '@chakra-ui/react';
import { Button } from './ui/Button';
import MdiIcon from '@mdi/react';
import { mdiAccountCircle, mdiChevronDown, mdiClose, mdiMenu } from '@mdi/js';
import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { signOut } from '@/utils/auth';
import { fetchNotifications } from '@/lib/api/notifications';
import { useNotificationsBadge } from '@/components/NotificationsProvider';
import { useProfilePhoto } from '@/hooks/useProfilePhoto';
import { NOTIFICATIONS_PATH, type UserRole } from '@/utils/routes';

/**
 * Partial view of the user object returned by GET /api/users/me.
 * The parent resolves this and builds the username string for this component.
 * (@see backend/src/routes/users.ts — GET /me)
 */
export interface NavUser {
  firstName: string;
  lastName: string;
  role: UserRole;
}

export type NavbarVariant = 'guest' | 'student' | 'security';

interface NavbarProps {
  variant?: NavbarVariant;
  /** Formatted display name — build as `${NavUser.firstName} ${NavUser.lastName}`. */
  userName?: string;
  /** Current pathname — pass from the layout via usePathname(). Falls back to internal usePathname() if omitted. */
  activePath?: string;
}

function formatUnreadBadge(count: number): string {
  return count > 9 ? '9+' : String(count);
}

// ── Dropdown ──────────────────────────────────────────────────────────────────

type DropdownVariant = 'user';

export interface DropdownItem {
  label: string;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
  /** Optional unread count shown beside the item label. */
  badge?: number;
}

type DropdownProps =
  | {
      variant: 'user';
      items: DropdownItem[];
      userName: string;
      unreadCount?: number;
    }
  | {
      variant: Exclude<DropdownVariant, 'user'>;
      items: DropdownItem[];
      userName?: never;
      unreadCount?: never;
    };

export function Dropdown({
  variant,
  items,
  userName,
  unreadCount = 0,
}: DropdownProps) {
  const router = useRouter();
  // Only the 'user' variant renders an avatar, so only it should fetch.
  const photoUrl = useProfilePhoto(variant === 'user');

  const trigger = (() => {
    switch (variant) {
      case 'user':
        return (
          <ChakraButton
            variant="ghost"
            size="sm"
            px={0}
            aria-label={
              unreadCount > 0
                ? `Account menu, ${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
                : 'Account menu'
            }
          >
            <HStack gap={2}>
              <Text fontSize="md" fontWeight="medium" color="gray.900">
                {userName}
              </Text>
              <Box position="relative" display="inline-flex">
                {photoUrl ? (
                  <Image
                    src={photoUrl}
                    alt=""
                    boxSize="22px"
                    rounded="full"
                    objectFit="cover"
                  />
                ) : (
                  <MdiIcon path={mdiAccountCircle} size={0.9} />
                )}
                {unreadCount > 0 && (
                  <Circle
                    size="8px"
                    bg="red.600"
                    position="absolute"
                    top="-1px"
                    right="-2px"
                    pointerEvents="none"
                    aria-hidden
                  />
                )}
              </Box>
              <MdiIcon path={mdiChevronDown} size={0.7} />
            </HStack>
          </ChakraButton>
        );
      default:
        variant satisfies never;
        return null;
    }
  })();

  return (
    <Menu.Root>
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Menu.Positioner mt={4}>
        <Menu.Content minW="160px">
          {items.map(({ label, href, onClick, danger, badge }) => (
            <Menu.Item
              key={label}
              value={label.toLowerCase()}
              fontSize="sm"
              fontWeight="medium"
              color={danger ? 'red.500' : 'gray.700'}
              px={4}
              py={2}
              _highlighted={{ bg: 'gray.100' }}
              onClick={() => {
                if (onClick) {
                  onClick();
                } else if (href) {
                  router.push(href);
                }
              }}
            >
              <HStack justify="space-between" w="full" gap={4}>
                <Text as="span">{label}</Text>
                {badge != null && badge > 0 && (
                  <Circle
                    size="18px"
                    bg="red.600"
                    color="white"
                    fontSize="10px"
                    fontWeight="bold"
                    flexShrink={0}
                  >
                    {formatUnreadBadge(badge)}
                  </Circle>
                )}
              </HStack>
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────

/** Nav links per variant. */
const navLinksByVariant: Record<
  NavbarVariant,
  { label: string; href: string }[]
> = {
  guest: [{ label: 'Home', href: '/' }],
  student: [
    { label: 'Home', href: '/student/dashboard' },
    { label: 'My Claims', href: '/student/my-claims' },
  ],
  security: [
    { label: 'Home', href: '/security/dashboard' },
    { label: 'Items', href: '/security/items' },
    { label: 'Claims', href: '/security/claims' },
  ],
};

/** Dropdown items shown under the user menu, per variant. */
const userMenuItemsByVariant: Record<
  Exclude<NavbarVariant, 'guest'>,
  DropdownItem[]
> = {
  student: [
    { label: 'Profile', href: '/profile' },
    { label: 'Notifications', href: NOTIFICATIONS_PATH },
    { label: 'Sign Out', onClick: signOut, danger: true },
  ],
  security: [
    { label: 'Profile', href: '/profile' },
    { label: 'Notifications', href: NOTIFICATIONS_PATH },
    { label: 'Sign Out', onClick: signOut, danger: true },
  ],
};

function withNotificationBadge(
  items: DropdownItem[],
  unreadCount: number
): DropdownItem[] {
  return items.map((item) =>
    item.label === 'Notifications' && unreadCount > 0
      ? { ...item, badge: unreadCount }
      : item
  );
}

// ── Navbar ────────────────────────────────────────────────────────────────────

export default function Navbar({
  variant = 'guest',
  userName = 'User Name',
  activePath,
}: NavbarProps) {
  const pathname = usePathname();
  const currentPath = activePath ?? pathname;
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = navLinksByVariant[variant];
  const isAuthenticated = variant !== 'guest';

  // Unread badge on the account menu. When a NotificationsProvider is mounted
  // the count is shared with the feed and updates live as cards are marked
  // read; otherwise fall back to local state refreshed on route change.
  const badge = useNotificationsBadge();
  const badgeSetUnreadCount = badge?.setUnreadCount ?? null;
  const [selfUnreadCount, setSelfUnreadCount] = useState(0);
  const unreadCount = badge ? badge.unreadCount : selfUnreadCount;

  const userMenuItems = isAuthenticated
    ? withNotificationBadge(userMenuItemsByVariant[variant], unreadCount)
    : [];

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let cancelled = false;
    fetchNotifications()
      .then((data) => {
        if (cancelled) {
          return;
        }
        if (badgeSetUnreadCount) {
          badgeSetUnreadCount(data.unreadCount);
        } else {
          setSelfUnreadCount(data.unreadCount);
        }
      })
      .catch(() => {
        // Badge is best-effort — keep the last known count on failure.
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, currentPath, badgeSetUnreadCount]);

  return (
    <Box
      as="nav"
      bg="white"
      borderBottom="1px solid"
      borderColor="gray.200"
      px={{ base: 4, md: 8 }}
      minH="75px"
      w="100%"
      position="sticky"
      top={0}
      zIndex={10}
    >
      {/* ── Main row (always visible) ─────────────────────────────────────── */}
      <Flex h="75px" align="center">
        {/* Brand — mr="auto" pushes all right-side items to the far right */}
        <HStack gap={2} mr="auto" align="baseline">
          <Text fontSize="2xl" fontWeight="bold" color="red.600" lineHeight="1">
            Seneca
          </Text>
          <Text fontSize="md" fontWeight="bold" color="gray.400" lineHeight="1">
            FoundIt
          </Text>
        </HStack>

        {/* Desktop: nav links + user menu (hidden on mobile) */}
        <HStack gap={10} display={{ base: 'none', md: 'flex' }} align="center">
          {navLinks.map(({ label, href }) => {
            const isActive = currentPath === href;
            return (
              <Link
                key={href}
                asChild
                fontSize="md"
                fontWeight="medium"
                color={isActive ? 'red.600' : 'gray.700'}
                borderBottom={isActive ? '2px solid' : 'none'}
                borderColor="red.600"
                pb={isActive ? '2px' : undefined}
                _hover={{ color: 'red.600', textDecoration: 'none' }}
              >
                <NextLink href={href}>{label}</NextLink>
              </Link>
            );
          })}

          {!isAuthenticated && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => router.push('/login')}
            >
              Login
            </Button>
          )}

          {isAuthenticated && (
            <Dropdown
              variant="user"
              userName={userName}
              items={userMenuItems}
              unreadCount={unreadCount}
            />
          )}
        </HStack>

        {/* Mobile: hamburger toggle (hidden on desktop) */}
        <Box position="relative" display={{ base: 'flex', md: 'none' }}>
          <IconButton
            aria-label={
              mobileOpen
                ? 'Close menu'
                : unreadCount > 0
                  ? `Open menu, ${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
                  : 'Open menu'
            }
            variant="ghost"
            onClick={() => setMobileOpen((prev) => !prev)}
          >
            {mobileOpen ? (
              <MdiIcon path={mdiClose} size={0.9} />
            ) : (
              <MdiIcon path={mdiMenu} size={0.9} />
            )}
          </IconButton>
          {isAuthenticated && unreadCount > 0 && !mobileOpen && (
            <Circle
              size="16px"
              bg="red.600"
              color="white"
              fontSize="10px"
              fontWeight="bold"
              position="absolute"
              top="2px"
              right="2px"
              pointerEvents="none"
            >
              {formatUnreadBadge(unreadCount)}
            </Circle>
          )}
        </Box>
      </Flex>

      {/* ── Mobile dropdown (expands below main row) ──────────────────────── */}
      {mobileOpen && (
        <VStack
          display={{ base: 'flex', md: 'none' }}
          align="stretch"
          gap={1}
          pb={3}
          borderTop="1px solid"
          borderColor="gray.200"
        >
          {navLinks.map(({ label, href }) => {
            const isActive = currentPath === href;
            return (
              <Link
                key={href}
                asChild
                display="block"
                px={4}
                py={2}
                fontSize="sm"
                fontWeight="medium"
                color={isActive ? 'red.600' : 'gray.700'}
                borderRadius="md"
                _hover={{ bg: 'gray.100', textDecoration: 'none' }}
                onClick={() => setMobileOpen(false)}
              >
                <NextLink href={href}>{label}</NextLink>
              </Link>
            );
          })}

          {!isAuthenticated && (
            <Box px={4} pt={2}>
              <Button
                variant="primary"
                size="sm"
                w="full"
                onClick={() => {
                  setMobileOpen(false);
                  router.push('/login');
                }}
              >
                Login
              </Button>
            </Box>
          )}

          {isAuthenticated && (
            <>
              <Box h="1px" bg="gray.200" my={1} mx={4} />
              {userMenuItems.map(({ label, href, onClick, danger, badge }) =>
                onClick ? (
                  <ChakraButton
                    key={label}
                    variant="ghost"
                    justifyContent="flex-start"
                    w="full"
                    px={4}
                    py={2}
                    h="auto"
                    fontSize="sm"
                    fontWeight="medium"
                    color={danger ? 'red.500' : 'gray.700'}
                    borderRadius="md"
                    _hover={{ bg: 'gray.100' }}
                    onClick={() => {
                      setMobileOpen(false);
                      onClick();
                    }}
                  >
                    {label}
                  </ChakraButton>
                ) : (
                  <Link
                    key={href}
                    asChild
                    display="block"
                    px={4}
                    py={2}
                    fontSize="sm"
                    fontWeight="medium"
                    color={danger ? 'red.500' : 'gray.700'}
                    borderRadius="md"
                    _hover={{ bg: 'gray.100', textDecoration: 'none' }}
                    onClick={() => setMobileOpen(false)}
                  >
                    <NextLink href={href!}>
                      <HStack justify="space-between" w="full" gap={4}>
                        <Text as="span">{label}</Text>
                        {badge != null && badge > 0 && (
                          <Circle
                            size="18px"
                            bg="red.600"
                            color="white"
                            fontSize="10px"
                            fontWeight="bold"
                            flexShrink={0}
                          >
                            {formatUnreadBadge(badge)}
                          </Circle>
                        )}
                      </HStack>
                    </NextLink>
                  </Link>
                )
              )}
            </>
          )}
        </VStack>
      )}
    </Box>
  );
}
