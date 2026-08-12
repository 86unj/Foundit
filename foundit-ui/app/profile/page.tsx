'use client';

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import NotificationFeed from '@/components/NotificationFeed';
import {
  NotificationsProvider,
  useNotificationsBadge,
} from '@/components/NotificationsProvider';
import { FixedPageBackground } from '@/components/PageBackground';
import TextInput from '@/components/TextInput';
import { useProfileForm } from '@/hooks/useProfileForm';
import { useLoggedInDisplayName } from '@/hooks/useLoggedInDisplayName';
import { getLoggedInUser } from '@/utils/auth';
import {
  Box,
  Button,
  Flex,
  HStack,
  Image,
  Spinner,
  Stack,
  Switch,
  Text,
} from '@chakra-ui/react';
import { Suspense, useRef, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// Returns a primitive string so useSyncExternalStore compares by value.
// Returning an object creates a new reference each render and causes an
// infinite loop.
function useLoggedInRole(): 'student' | 'security' {
  return useSyncExternalStore(
    () => () => {},
    () => (getLoggedInUser()?.role === 'security' ? 'security' : 'student'),
    () => 'student'
  );
}

type ActiveTab = 'profile' | 'notifications';

function ProfileSettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const navVariant = useLoggedInRole();
  const displayName = useLoggedInDisplayName();
  const activeTab: ActiveTab =
    searchParams.get('tab') === 'notifications' ? 'notifications' : 'profile';
  const notificationsBadge = useNotificationsBadge();
  const unreadCount = notificationsBadge?.unreadCount ?? 0;

  const {
    fullName,
    email,
    studentId,
    setStudentId,
    studentIdError,
    setStudentIdError,
    allowEmailNotifications,
    setAllowEmailNotifications,
    isLoading,
    isSaving,
    saveStatus,
    saveErrorMessage,
    handleSave,
    initials,
    photoUrl,
    photoStatus,
    photoError,
    handlePhotoSelected,
    handlePhotoRemove,
  } = useProfileForm();

  // "Change Photo" is a styled button rather than a label, so it forwards the
  // click to the hidden input.
  const photoInputRef = useRef<HTMLInputElement>(null);

  return (
    // Provider wraps this page (see ProfileSettingsPage) so the navbar bell
    // and the notifications tab share unread count without a navigation.
    <Box minH="100vh" display="flex" flexDirection="column" position="relative">
      <FixedPageBackground />

      <Box
        position="relative"
        zIndex={1}
        minH="100vh"
        display="flex"
        flexDirection="column"
      >
        <Navbar
          variant={navVariant}
          userName={displayName}
          activePath="/profile"
        />

        <Box
          flex={1}
          display="flex"
          alignItems="flex-start"
          justifyContent="center"
          px={{ base: 4, md: 6 }}
          py={{ base: 6, md: 10 }}
        >
          <Flex
            direction={{ base: 'column', md: 'row' }}
            gap={{ base: 4, md: 7 }}
            maxW="1000px"
            w="full"
            align="flex-start"
            minW={0}
          >
            {/* Left: profile side menu */}
            <Stack
              bg="white"
              rounded="md"
              shadow="md"
              w={{ base: 'full', md: '240px' }}
              flexShrink={0}
              gap={0}
              overflow="hidden"
              p={{ base: 2, md: 4 }}
            >
              <Box
                px={{ base: 3, md: 4 }}
                py={3}
                rounded="md"
                cursor="pointer"
                bg={activeTab === 'profile' ? 'blue.50' : 'transparent'}
                _hover={{
                  bg: activeTab === 'profile' ? 'blue.50' : 'gray.50',
                }}
                onClick={() => router.push('/profile')}
              >
                <Text
                  color={activeTab === 'profile' ? 'blue.700' : 'gray.700'}
                  fontWeight="medium"
                  fontSize="sm"
                >
                  Profile
                </Text>
              </Box>
              <Box
                px={{ base: 3, md: 4 }}
                py={3}
                cursor="pointer"
                rounded="md"
                bg={activeTab === 'notifications' ? 'blue.50' : 'transparent'}
                _hover={{
                  bg: activeTab === 'notifications' ? 'blue.50' : 'gray.50',
                }}
                onClick={() => router.push('/profile?tab=notifications')}
              >
                <HStack justify="space-between" gap={3}>
                  <Text
                    color={
                      activeTab === 'notifications' ? 'blue.700' : 'gray.700'
                    }
                    fontWeight="medium"
                    fontSize="sm"
                  >
                    Notifications
                  </Text>
                  {unreadCount > 0 ? (
                    <Box
                      as="span"
                      display="inline-flex"
                      alignItems="center"
                      justifyContent="center"
                      minW="22px"
                      h="18px"
                      px={1.5}
                      rounded="full"
                      bg="red.600"
                      color="white"
                      fontSize="10px"
                      fontWeight="bold"
                      flexShrink={0}
                      lineHeight="1"
                      aria-label={`${unreadCount} unread`}
                    >
                      {unreadCount}
                    </Box>
                  ) : null}
                </HStack>
              </Box>
              <Box
                px={{ base: 3, md: 4 }}
                py={3}
                cursor="pointer"
                rounded="md"
                _hover={{ bg: 'red.50' }}
                onClick={() => router.push('/login')}
              >
                <Text color="red.600" fontWeight="medium" fontSize="sm">
                  Sign out
                </Text>
              </Box>
            </Stack>

            {/* Right panel — switches between Profile and Notifications */}
            <Stack
              bg="white"
              rounded="md"
              shadow="md"
              flex={1}
              w={{ base: 'full', md: 'auto' }}
              minW={0}
              maxW={{ base: 'full', md: '720px' }}
              p={{ base: 5, md: 8 }}
              gap={6}
            >
              {activeTab === 'profile' ? (
                <>
                  <Text
                    fontSize={{ base: 'xl', md: '2xl' }}
                    fontWeight="bold"
                    color="gray.900"
                  >
                    Profile Settings
                  </Text>

                  {isLoading ? (
                    <Flex align="center" justify="center" py={10}>
                      <Spinner size="lg" color="blue.500" />
                    </Flex>
                  ) : (
                    <>
                      {/* Avatar + change photo — the photo saves on
                            selection, independently of the Save button. */}
                      <Stack gap={2}>
                        <Flex gap={4} align="center" wrap="wrap">
                          {photoUrl ? (
                            <Image
                              src={photoUrl}
                              alt=""
                              w="80px"
                              h="80px"
                              rounded="full"
                              objectFit="cover"
                              flexShrink={0}
                            />
                          ) : (
                            <Flex
                              w="80px"
                              h="80px"
                              rounded="full"
                              bg="blue.500"
                              align="center"
                              justify="center"
                              flexShrink={0}
                            >
                              <Text
                                color="white"
                                fontSize="2xl"
                                fontWeight="bold"
                              >
                                {initials || '?'}
                              </Text>
                            </Flex>
                          )}

                          <input
                            ref={photoInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            hidden
                            data-testid="profile-photo-input"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              // Reset first so re-picking the same file
                              // still fires a change event.
                              e.target.value = '';
                              if (file) handlePhotoSelected(file);
                            }}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            borderColor="gray.300"
                            loading={photoStatus === 'uploading'}
                            loadingText="Uploading..."
                            onClick={() => photoInputRef.current?.click()}
                          >
                            Change Photo
                          </Button>

                          {photoUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              color="red.600"
                              disabled={photoStatus === 'uploading'}
                              onClick={handlePhotoRemove}
                            >
                              Remove
                            </Button>
                          )}
                        </Flex>

                        {photoError && (
                          <Text
                            fontSize="sm"
                            color="fg.error"
                            fontWeight="medium"
                          >
                            {photoError}
                          </Text>
                        )}
                      </Stack>

                      {/* Form fields */}
                      <Stack gap={5} w="full" minW={0}>
                        <TextInput
                          id="fullName"
                          label="Full Name"
                          value={fullName}
                          width="full"
                          disabled
                          readOnly
                        />

                        <TextInput
                          id="email"
                          label="Email Address"
                          type="email"
                          autoComplete="email"
                          value={email}
                          width="full"
                          disabled
                          readOnly
                        />

                        {navVariant === 'student' && (
                          <TextInput
                            id="studentId"
                            label="Student ID"
                            value={studentId}
                            width="full"
                            inputMode="numeric"
                            autoComplete="off"
                            error={studentIdError}
                            onChange={(e) => {
                              setStudentId(e.target.value);
                              setStudentIdError('');
                            }}
                          />
                        )}

                        <Flex gap={4} align="center" wrap="wrap">
                          <Text fontSize="sm" color="gray.700">
                            Allow email notifications
                          </Text>
                          <Switch.Root
                            colorPalette="blue"
                            checked={allowEmailNotifications}
                            onCheckedChange={(e: { checked: boolean }) =>
                              setAllowEmailNotifications(e.checked)
                            }
                          >
                            <Switch.HiddenInput />
                            <Switch.Control>
                              <Switch.Thumb />
                            </Switch.Control>
                          </Switch.Root>
                        </Flex>
                      </Stack>

                      {/* Save row */}
                      <Flex
                        gap={4}
                        align={{ base: 'stretch', sm: 'center' }}
                        direction={{ base: 'column', sm: 'row' }}
                      >
                        <Button
                          colorPalette="blue"
                          w={{ base: 'full', sm: '157px' }}
                          h="40px"
                          rounded="md"
                          fontSize="md"
                          loading={isSaving}
                          loadingText="Saving..."
                          onClick={() =>
                            handleSave({
                              includeStudentId: navVariant === 'student',
                            })
                          }
                        >
                          Save
                        </Button>

                        {saveStatus === 'success' && (
                          <Text
                            fontSize="sm"
                            color="green.600"
                            fontWeight="medium"
                          >
                            Changes saved.
                          </Text>
                        )}
                        {saveStatus === 'error' && (
                          <Text
                            fontSize="sm"
                            color="red.600"
                            fontWeight="medium"
                          >
                            {saveErrorMessage ||
                              'Save failed. Please try again.'}
                          </Text>
                        )}
                      </Flex>
                    </>
                  )}
                </>
              ) : (
                <NotificationFeed />
              )}
            </Stack>
          </Flex>
        </Box>

        <Footer />
      </Box>
    </Box>
  );
}

export default function ProfileSettingsPage() {
  return (
    <NotificationsProvider>
      <Suspense fallback={null}>
        <ProfileSettingsContent />
      </Suspense>
    </NotificationsProvider>
  );
}
