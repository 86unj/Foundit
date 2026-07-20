'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Grid,
  Heading,
  HStack,
  Link,
  Stack,
  Text,
} from '@chakra-ui/react';
import FormTextInput from '@/components/FormTextInput';
import SelectInput from '@/components/SelectInput';
import TextAreaInput from '@/components/TextAreaInput';
import ImageUploadGallery from '@/components/ImageUploadGallery';
import { Button } from '@/components/ui/Button';
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
import { PROFILE_PATH } from '@/utils/routes';

// ─── NOTES FOR THE TEAM ──────────────────────────────────────────────────────
// Student claim form. Lives under app/student/ so it inherits RoleShell
// (Navbar/Footer) from app/student/layout.tsx and the middleware's
// student-role gate. FixedPageBackground sits behind the form content.
//
// Layout: Contact info (read-only identity), then Item details
// (required + optional item fields).
//
// Wired to existing utils:
//   • utils/auth.ts         → getAccessToken (upload + submit), getLoggedInUser
//                             (read-only identity rows)
//   • constants/categories.ts → CATEGORIES for the Category dropdown
//   • hooks/useClaimItemForm  → state, validation mirroring createClaimSchema,
//                             POST /api/claims
//
// Notes on a few fields:
//   1. Student ID — the login payload (LoggedInUser in localStorage) carries
//      only the userId UUID, so the real studentNumber is fetched from
//      GET /api/users/me on mount (same pattern as useProfileForm). The UUID
//      is never shown; the row reads "—" until the fetch resolves or when the
//      account has no student number.
//   2. dateLost / locationLost are optional (createClaimSchema); empty values
//      are omitted from the POST body.
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

function SectionHeader({ title }: { title: string }) {
  return (
    <Heading
      as="h2"
      fontSize="xs"
      fontWeight="semibold"
      letterSpacing="0.08em"
      textTransform="uppercase"
      color="fg.muted"
      pb={2}
      mb={1}
      borderBottomWidth="1px"
      borderBottomColor="gray.200"
    >
      {title}
    </Heading>
  );
}

function ClaimForm({ displayName }: { displayName: string }) {
  const form = useClaimItemForm();
  const accessToken = useAccessToken();
  const user = useLoggedInUser();
  const isStudent = user?.role === 'student';
  const canSubmit = Boolean(accessToken && isStudent);

  // The login payload has no studentNumber, so fetch it from the profile
  // endpoint. userId stays internal — it is never rendered.
  const [studentNumber, setStudentNumber] = useState<string | null>(null);
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
      rounded="xl"
      maxW="985px"
      w="full"
      p={{ base: 6, md: 12 }}
      gap={6}
    >
      <Stack gap={5}>
        <SectionHeader title="Contact info" />

        <ReadonlyRow label="Your Name" value={displayName || '—'} />
        <ReadonlyRow label="Student ID" value={studentNumber ?? '—'} />
        <Stack gap={1}>
          <ReadonlyRow label="Email Address" value={user?.email || '—'} />
          <Text fontSize="sm" color="fg.muted" pl={{ base: 0, sm: '196px' }}>
            To receive claim status updates by email, turn on email
            notifications in your{' '}
            <Link href={PROFILE_PATH} color="blue.500">
              profile settings
            </Link>
            .
          </Text>
        </Stack>
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
        <SectionHeader title="Item details" />

        <Grid
          templateColumns={{ base: '1fr', md: 'minmax(160px, 0.35fr) 1fr' }}
          gap={5}
        >
          <SelectInput
            id="category"
            label="Category"
            required
            stacked
            options={CATEGORIES}
            placeholder="Select a category"
            value={form.category}
            error={form.errors.category}
            onChange={(e) => {
              form.setCategory(e.target.value);
              form.clearError('category');
            }}
          />

          <FormTextInput
            id="itemName"
            label="Item Name"
            required
            stacked
            placeholder="e.g. Black Hydro Flask water bottle"
            maxLength={100}
            value={form.itemName}
            error={form.errors.itemName}
            onChange={(e) => {
              form.setItemName(e.target.value);
              form.clearError('itemName');
            }}
          />
        </Grid>

        <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={5}>
          <FormTextInput
            id="dateLost"
            label="Date Lost"
            stacked
            type="date"
            max={form.todayISO()}
            value={form.dateLost}
            error={form.errors.dateLost}
            onChange={(e) => {
              form.setDateLost(e.target.value);
              form.clearError('dateLost');
            }}
          />

          <FormTextInput
            id="locationLost"
            label="Location Lost"
            stacked
            placeholder="e.g., Library 2nd floor, near Tim Hortons"
            maxLength={255}
            value={form.locationLost}
            error={form.errors.locationLost}
            onChange={(e) => {
              form.setLocationLost(e.target.value);
              form.clearError('locationLost');
            }}
          />
        </Grid>

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

        <TextAreaInput
          id="additionalInformation"
          label="Additional Information"
          stacked
          placeholder="Anything else that could help verify ownership (serial number, stickers, contents…)"
          maxLength={2000}
          value={form.additionalInformation}
          onChange={(e) => form.setAdditionalInformation(e.target.value)}
        />

        {accessToken && (
          <Box>
            <HStack justify="space-between" mb={2}>
              <Text fontSize="sm" color="fg.muted">
                Upload an image showing proof of ownership
              </Text>
              <Text fontSize="sm" color="blue.500">
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
        {form.submitError && (
          <HStack gap={2} color="red.600">
            <LuCircleAlert size={16} aria-hidden />
            <Text fontSize="sm" fontWeight="medium">
              {form.submitError}
            </Text>
          </HStack>
        )}

        <HStack justify="center" gap={4} pt={2}>
          <Button
            variant="muted"
            size="lg"
            w="140px"
            onClick={form.handleCancel}
            disabled={form.isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            w="140px"
            disabled={!canSubmit || form.isSubmitting}
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
