'use client';

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import TextInput from '@/components/TextInput';
import { useProfileForm } from '@/hooks/useProfileForm';
import { useLoggedInDisplayName } from '@/hooks/useLoggedInDisplayName';
import { getLoggedInUser, signOut } from '@/utils/auth';
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
import { useSyncExternalStore, useState } from 'react';

function useLoggedInRole(): 'student' | 'security' {
  return useSyncExternalStore(
    () => () => {},
    () => (getLoggedInUser()?.role === 'security' ? 'security' : 'student'),
    () => 'student'
  );
}

type ActiveTab = 'profile' | 'notifications';

export default function ProfileSettingsPage() {
  const navVariant = useLoggedInRole();
  const displayName = useLoggedInDisplayName();
  const [activeTab, setActiveTab] = useState<ActiveTab>('profile');

  const {
    fullName,
    email,
    phoneNumber,
    setPhoneNumber,
    employeeId,
    campusName,
    studentNumber,
    role,
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
      <Box
        position="fixed"
        inset={0}
        backgroundImage="url('/bg.svg')"
        backgroundSize="cover"
        backgroundPosition="center"
        backgroundRepeat="no-repeat"
        zIndex={0}
      />
      <Box position="fixed" inset={0} bg="blackAlpha.700" zIndex={0} />

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
                onClick={() => setActiveTab('profile')}
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
                onClick={() => setActiveTab('notifications')}
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
                onClick={signOut}
              >
                <Text color="red.600" fontWeight="medium" fontSize="sm">
                  Sign out
                </Text>
              </Box>
            </Stack>

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
                          value={phoneNumber}
                          width="full"
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          hint="Optional. Enter 10 digits with no spaces or dashes."
                        />

                        {role === 'security' && (
                          <>
                            <TextInput
                              id="employeeId"
                              label="Employee ID"
                              value={employeeId}
                              width="full"
                              disabled
                              readOnly
                            />
                            <TextInput
                              id="campus"
                              label="Campus"
                              value={campusName || '—'}
                              width="full"
                              disabled
                              readOnly
                            />
                          </>
                        )}

                        {role === 'student' && studentNumber && (
                          <TextInput
                            id="studentNumber"
                            label="Student Number"
                            value={studentNumber}
                            width="full"
                            disabled
                            readOnly
                          />
                        )}

                        {role === 'student' && (
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
                        )}
                      </Stack>

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
                <Flex
                  direction="column"
                  align="center"
                  justify="center"
                  gap={3}
                  py={16}
                  color="gray.400"
                >
                  <Text
                    fontSize="2xl"
                    fontWeight="bold"
                    color="gray.900"
                    alignSelf="flex-start"
                  >
                    Notifications
                  </Text>
                  <Text
                    fontSize="sm"
                    color="gray.500"
                    textAlign="center"
                    mt={8}
                  >
                    Notification settings are not yet available.
                  </Text>
                </Flex>
              )}
            </Stack>
          </HStack>
        </Box>

        <Footer />
      </Box>
    </Box>
  );
}
