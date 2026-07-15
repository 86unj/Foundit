'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Heading,
  HStack,
  RadioGroup,
  Stack,
  Text,
} from '@chakra-ui/react';
import FormTextInput from '@/components/FormTextInput';
import SelectInput from '@/components/SelectInput';
import TextAreaInput from '@/components/TextAreaInput';
import ImageUploadGallery from '@/components/ImageUploadGallery';
import { LuCircleAlert } from 'react-icons/lu';
import { CATEGORIES } from '@/constants/categories';
import { useClaimItemForm } from '@/hooks/useClaimItemForm';
import { useLoggedInDisplayName } from '@/hooks/useLoggedInDisplayName';
import { useAccessToken } from '@/hooks/useAccessToken';
import { useLoggedInUser } from '@/hooks/useLoggedInUser';
import { getAccessToken } from '@/utils/auth';
import { API_BASE, authFetch } from '@/lib/api/client';
import { debugLog, debugWarn } from '@/utils/debug';
import { FixedPageBackground } from '@/components/PageBackground';

// ─── NOTES FOR THE TEAM ──────────────────────────────────────────────────────
// Student claim form (Figma nodes 273-891 default / 725-1573 validation).
// Lives under app/student/ so it inherits RoleShell (Navbar/Footer) from
// app/student/layout.tsx and the middleware's student-role gate. The hero
// background/overlay are position:fixed at zIndex 0: above RoleShell's gray.50
// page background, below the sticky Navbar (zIndex 10) and Footer (zIndex 1).
//
// Wired to existing utils:
//   • utils/auth.ts         → getAccessToken (upload + submit), getLoggedInUser
//                             (read-only identity rows)
//   • constants/categories.ts → CATEGORIES for the Item to Claim dropdown
//   • hooks/useClaimItemForm  → state, validation mirroring createClaimSchema,
//                             POST /api/claims
//
// Notes on a few fields:
//   1. Student ID — the login payload (LoggedInUser in localStorage) carries
//      only the userId UUID, so the real studentNumber is fetched from
//      GET /api/users/me on mount (same pattern as useProfileForm). The UUID
//      is never shown; the row reads "—" until the fetch resolves or when the
//      account has no student number. The same response supplies `phone`,
//      which decides whether the phone notification options are selectable.
//   2. Item Name, Notification preferences and Additional Information are
//      sent on submit (createClaimSchema: itemName, notificationPreference,
//      additionalInfo).
//   3. Proof-of-ownership images are uploaded to R2 at submit time (mirrors
//      report-found's handleImageUpload loop) and sent as `images` on the
//      claim payload, linked to the claim via ItemImage.claimId.
// ─────────────────────────────────────────────────────────────────────────────

export default function ClaimItemPage() {
  const displayName = useLoggedInDisplayName('');

  return (
    <>
      {/* Full-bleed hero behind RoleShell's content (see notes at top). */}
      <FixedPageBackground overlay />

      <Box
        position="relative"
        zIndex={1}
        display="flex"
        flexDirection="column"
        alignItems="center"
        gap={8}
      >
        <Heading
          as="h1"
          color="white"
          fontSize={{ base: '2xl', md: '4xl' }}
          fontWeight="bold"
          textAlign="center"
        >
          Claim Your Lost Item
        </Heading>

        <ClaimForm displayName={displayName} />
      </Box>
    </>
  );
}

function ReadonlyRow({ label, value }: { label: string; value: string }) {
  return (
    <HStack align="flex-start" gap={4}>
      <Text
        w="180px"
        flexShrink={0}
        fontSize="1rem"
        fontWeight="semibold"
        color="fg"
      >
        {label}
      </Text>
      <Text fontSize="1rem" color="gray.700" wordBreak="break-all">
        {value}
      </Text>
    </HStack>
  );
}

function ClaimForm({ displayName }: { displayName: string }) {
  const form = useClaimItemForm();
  // Real session data (utils/auth.ts) — the identity rows and the student-only
  // gate the backend enforces. No mock data on this form.
  const accessToken = useAccessToken();
  const user = useLoggedInUser();
  const isStudent = user?.role === 'student';

  // The login payload has no studentNumber or phone, so fetch both from the
  // profile endpoint. userId stays internal — it is never rendered. `phone`
  // gates the phone-based notification options: until the fetch resolves (or
  // when the account has no number) they stay disabled with a hint.
  const [studentNumber, setStudentNumber] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  useEffect(() => {
    let active = true;

    async function loadProfile() {
      if (!getAccessToken()) {
        debugWarn('claim-page', 'skipping profile fetch — no session');
        return;
      }
      try {
        const res = await authFetch(`${API_BASE}/api/users/me`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          studentNumber: number | null;
          phone: string | null;
        };
        if (data.studentNumber === null) {
          debugLog(
            'claim-page',
            'account has no studentNumber — Student ID row shows placeholder'
          );
        }
        if (!active) return;
        if (data.studentNumber !== null) {
          setStudentNumber(String(data.studentNumber));
        }
        setPhone(data.phone);
      } catch (err) {
        // Rows keep their placeholders; authFetch already logged the call.
        debugWarn('claim-page', 'profile fetch failed', err);
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, []);

  return (
    <Stack
      bg="white"
      rounded="md"
      shadow="md"
      maxW="985px"
      w="full"
      p={{ base: 6, md: 12 }}
      gap={6}
    >
      {/* Figma spec: 30px bold (#0f172a). Chakra v3 size="lg" is only 18px,
          so use 3xl (30px) — don't confuse with v2 sizes. */}
      <Heading size="3xl" color="gray.900" mb={6}>
        Claim Item
      </Heading>

      {/*
        Read-only identity rows from the design — prefilled from the logged-in
        user, not editable inputs. Student ID is the studentNumber from
        GET /api/users/me, never the userId UUID (see notes at top of file).
      */}
      {/* gap={5} matches the form-field Stack below so the identity rows
          share the same vertical rhythm. */}
      <Stack gap={5}>
        <ReadonlyRow label="Your Name" value={displayName || '—'} />
        <ReadonlyRow label="Student ID" value={studentNumber ?? '—'} />
        <ReadonlyRow label="Email Address" value={user?.email || '—'} />
      </Stack>

      {!accessToken && (
        <Text fontSize="sm" color="red.600">
          You must be logged in as a student to submit a claim.
        </Text>
      )}

      {accessToken && !isStudent && (
        <Text fontSize="sm" color="red.600">
          Only student accounts can submit claims.
        </Text>
      )}

      <Stack gap={5}>
        {/* STUB — not persisted (no claim column; see notes at top of file).
            Email is preselected (students are opted in by default); the
            phone options unlock only when GET /api/users/me returned a phone
            number, since User.phone is optional at signup. */}
        {/* <HStack align="flex-start" gap={4}>
          {/* minW (not fixed w) — the nowrap text is wider than the 180px
              label column and would otherwise spill into the gap and sit
              flush against the radios. */}
        {/* <Text
            minW="180px"
            flexShrink={0}
            fontSize="1rem"
            fontWeight="semibold"
            color="fg"
            whiteSpace="nowrap"
          >
            Notification preferences
          </Text> */}
        {/* <Stack gap={2.5}>
            <RadioGroup.Root
              colorPalette="blue"
              value={form.notificationPreference}
              onValueChange={(e: { value: string | null }) => {
                // Ark's details.value is a plain string; narrow it before it
                // reaches the hook's NotificationPreference union.
                if (
                  e.value === 'email' ||
                  e.value === 'phone' ||
                  e.value === 'email_and_phone'
                ) {
                  form.setNotificationPreference(e.value);
                }
              }}
            >
              <HStack gap={6} flexWrap="wrap">
                {[
                  { value: 'email', label: 'Email', needsPhone: false },
                  { value: 'phone', label: 'Phone', needsPhone: true },
                  {
                    value: 'email_and_phone',
                    label: 'Email and phone',
                    needsPhone: true,
                  },
                ].map((option) => (
                  <RadioGroup.Item
                    key={option.value}
                    value={option.value}
                    disabled={option.needsPhone && !phone}
                  >
                    <RadioGroup.ItemHiddenInput />
                    <RadioGroup.ItemIndicator />
                    <RadioGroup.ItemText fontSize="sm" color="fg.muted">
                      {option.label}
                    </RadioGroup.ItemText>
                  </RadioGroup.Item>
                ))}
              </HStack>
            </RadioGroup.Root>
            {!phone && (
              <Text fontSize="xs" color="fg.muted">
                Add a phone number to your profile to receive phone
                notifications.
              </Text>
            )}
          </Stack>
        </HStack> */}

        <SelectInput
          id="category"
          label="Item to Claim"
          required
          options={CATEGORIES}
          placeholder="Select a category"
          selectWidth="fit-content"
          value={form.category}
          error={form.errors.category}
          onChange={(e) => {
            form.setCategory(e.target.value);
            form.clearError('category');
          }}
        />

        {/* STUB — validated but not persisted yet (no claim column; see
            notes at top of file). maxLength matches Item.title (100). */}
        <FormTextInput
          id="itemName"
          label="Item Name"
          required
          placeholder="e.g. Black Hydro Flask water bottle"
          maxLength={100}
          value={form.itemName}
          error={form.errors.itemName}
          onChange={(e) => {
            form.setItemName(e.target.value);
            form.clearError('itemName');
          }}
        />

        <TextAreaInput
          id="description"
          label="Describe Your Item"
          required
          stacked
          placeholder="Describe the item — color, brand, size, distinguishing features"
          maxLength={2000}
          value={form.description}
          error={form.errors.description}
          onChange={(e) => {
            form.setDescription(e.target.value);
            form.clearError('description');
          }}
        />

        {/* STUB — not persisted (no claim column; see notes at top of file). */}
        <TextAreaInput
          id="additionalInformation"
          label="Additional Information"
          stacked
          value={form.additionalInformation}
          onChange={(e) => form.setAdditionalInformation(e.target.value)}
        />

        {/* Proof-of-ownership upload — optional, large drop-zone (design). */}
        {accessToken && (
          <Box>
            <HStack justify="space-between" mb={2}>
              <Text fontSize="sm" color="#64748b">
                Upload an image showing proof of ownership
              </Text>
              <Text fontSize="1rem" color="blue.500">
                Optional
              </Text>
            </HStack>
            <ImageUploadGallery
              variant="dropzone"
              onChange={(files) => form.setImageFiles(files)}
            />
          </Box>
        )}
      </Stack>
      <Stack>
        <Text fontSize="sm" color="blue.500" textAlign="center">
          Opt in to email notifications to receive claim status updates.
        </Text>

        {form.submitError && (
          <HStack gap={2} color="red.600">
            <LuCircleAlert size={16} aria-hidden />
            <Text fontSize="sm" fontWeight="medium">
              {form.submitError}
            </Text>
          </HStack>
        )}

        {/* Figma spec: 42px-tall buttons with 16px text — Chakra size="lg"
          (44px / 16px) is the closest step; default md is 40px / 14px. */}
        <HStack justify="center" gap={4} pt={2}>
          <Button
            variant="outline"
            size="lg"
            borderColor="border.input"
            w="140px"
            onClick={form.handleCancel}
            disabled={form.isSubmitting}
          >
            Cancel
          </Button>
          <Button
            colorPalette="blue"
            size="lg"
            w="140px"
            loading={form.isSubmitting}
            loadingText="Submitting..."
            onClick={form.handleSubmit}
          >
            Submit
          </Button>
        </HStack>
      </Stack>
    </Stack>
  );
}
