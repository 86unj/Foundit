'use client';

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import NotificationFeed from '@/components/NotificationFeed';
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
  Spinner,
  Stack,
  Switch,
  Text,
} from '@chakra-ui/react';
import { Suspense, useSyncExternalStore } from 'react';
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

  const {
    fullName,
    email,
    phoneNumber,
    setPhoneNumber,
    allowEmailNotifications,
    setAllowEmailNotifications,
    isLoading,
    isSaving,
    saveStatus,
    handleSave,
    initials,
  } = useProfileForm();

  return (
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
          px={4}
          py={10}
        >
          <HStack gap={7} maxW="1000px" w="full" align="flex-start">
            {/* Left: profile side menu */}
            <Stack
              bg="white"
              rounded="md"
              shadow="md"
              w="240px"
              flexShrink={0}
              gap={0}
              overflow="hidden"
              p={4}
            >
              <Box
                px={4}
                py={3}
                rounded="md"
                cursor="pointer"
                bg={activeTab === 'profile' ? 'blue.500' : 'transparent'}
                _hover={{
                  bg: activeTab === 'profile' ? 'blue.500' : 'gray.50',
                }}
                onClick={() => router.push('/profile')}
              >
                <Text
                  color={activeTab === 'profile' ? 'white' : 'gray.700'}
                  fontWeight="medium"
                  fontSize="sm"
                >
                  Profile
                </Text>
              </Box>
              <Box
                px={4}
                py={3}
                cursor="pointer"
                rounded="md"
                bg={activeTab === 'notifications' ? 'blue.500' : 'transparent'}
                _hover={{
                  bg: activeTab === 'notifications' ? 'blue.500' : 'gray.50',
                }}
                onClick={() => router.push('/profile?tab=notifications')}
              >
                <Text
                  color={activeTab === 'notifications' ? 'white' : 'gray.700'}
                  fontWeight="medium"
                  fontSize="sm"
                >
                  Notifications
                </Text>
              </Box>
              <Box
                px={4}
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
            <Stack bg="white" rounded="md" shadow="md" flex={1} p={10} gap={6}>
              {activeTab === 'profile' ? (
                <>
                  <Text fontSize="2xl" fontWeight="bold" color="gray.900">
                    Profile Settings
                  </Text>

                  {isLoading ? (
                    <Flex align="center" justify="center" py={10}>
                      <Spinner size="lg" color="blue.500" />
                    </Flex>
                  ) : (
                    <>
                      {/* Avatar + change photo */}
                      <HStack gap={4} align="center">
                        <Flex
                          w="80px"
                          h="80px"
                          rounded="full"
                          bg="blue.500"
                          align="center"
                          justify="center"
                          flexShrink={0}
                        >
                          <Text color="white" fontSize="2xl" fontWeight="bold">
                            {initials || '?'}
                          </Text>
                        </Flex>
                        <Button
                          variant="outline"
                          size="sm"
                          borderColor="gray.300"
                        >
                          Change Photo
                        </Button>
                      </HStack>

                      {/* Form fields */}
                      <Stack gap={5}>
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

                        <TextInput
                          id="phoneNumber"
                          label="Phone Number"
                          type="tel"
                          autoComplete="tel"
                          hint="10 digits (e.g. 4161234567). Dashes and spaces are OK."
                          value={phoneNumber}
                          width="full"
                          onChange={(e) => setPhoneNumber(e.target.value)}
                        />

                        <HStack gap={4} align="center">
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
                        </HStack>
                      </Stack>

                      {/* Save row */}
                      <HStack gap={4} align="center">
                        <Button
                          colorPalette="blue"
                          w="157px"
                          h="40px"
                          rounded="md"
                          fontSize="md"
                          loading={isSaving}
                          loadingText="Saving..."
                          onClick={handleSave}
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
                            Save failed. Please try again.
                          </Text>
                        )}
                      </HStack>
                    </>
                  )}
                </>
              ) : (
                <NotificationFeed />
              )}
            </Stack>
          </HStack>
        </Box>

        <Footer />
      </Box>
    </Box>
  );
}

export default function ProfileSettingsPage() {
  return (
    <Suspense fallback={null}>
      <ProfileSettingsContent />
    </Suspense>
  );
}
