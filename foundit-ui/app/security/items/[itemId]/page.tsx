'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Badge,
  Box,
  Dialog,
  Flex,
  Grid,
  Heading,
  Input,
  Menu,
  NativeSelect,
  Portal,
  Spinner,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react';
import { ItemDetailRow } from '@/components/items/ItemDetailField';
import { DetailImageGallery } from '@/components/DetailImageGallery';
import { ItemStatusBadge } from '@/components/items/ItemStatusProgress';
import { Button } from '@/components/ui/Button';
import {
  fetchSecurityItem,
  updateSecurityItem,
  updateSecurityItemStatus,
} from '@/lib/api/items';
import { CATEGORIES } from '@/constants/categories';
import type { ItemStatus, SecurityItemDetail } from '@/types/items';

const DISPOSABLE_STATUSES = new Set<ItemStatus>([
  'pending_report',
  'stored',
  'expired',
]);

const PLACEHOLDER = '—';

const actionButtonStyles = {
  minW: '130px',
  h: 10,
  fontWeight: 'semibold',
  fontSize: 'sm',
} as const;

const editInputStyles = {
  h: 10,
  px: 3,
  fontSize: 'md',
  color: '#1a1a1a',
  bg: 'white',
  borderWidth: '1px',
  borderRadius: 'md',
  borderColor: '#D9D9D9',
  _focusVisible: {
    outline: 'none',
    boxShadow: '0 0 0 2px #009adb',
    borderColor: 'inherit',
  },
} as const;

function formatDate(value: string | null): string {
  if (!value) return PLACEHOLDER;
  return new Date(value).toLocaleDateString('en-CA');
}

function toDateInputValue(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA');
}

interface EditForm {
  title: string;
  category: string;
  dateFound: string;
  locationFound: string;
  description: string;
}

export default function SecurityItemDetailPage() {
  const params = useParams<{ itemId: string }>();
  const router = useRouter();
  const itemId = params?.itemId;

  const [item, setItem] = useState<SecurityItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [navigatingToRelease, setNavigatingToRelease] = useState(false);
  const [disposeDialogOpen, setDisposeDialogOpen] = useState(false);
  const [disposing, setDisposing] = useState(false);
  const [disposeError, setDisposeError] = useState('');

  useEffect(() => {
    if (!itemId) return;

    let active = true;

    async function loadItem() {
      setLoading(true);
      setError('');

      try {
        const data = await fetchSecurityItem(itemId);
        if (active) setItem(data);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : 'Failed to load item details.'
        );
        setItem(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadItem();
    return () => {
      active = false;
    };
  }, [itemId]);

  function handleCancel() {
    router.push('/security/items');
  }

  function handleStartEdit() {
    if (!item) return;
    setSaveError('');
    setForm({
      title: item.title,
      category: item.category,
      dateFound: toDateInputValue(item.dateFound),
      locationFound: item.locationFound ?? '',
      description: item.descriptionInternal ?? item.descriptionPublic ?? '',
    });
    setEditing(true);
  }

  function handleCancelEdit() {
    setEditing(false);
    setForm(null);
    setSaveError('');
  }

  function handleFormChange<K extends keyof EditForm>(
    key: K,
    value: EditForm[K]
  ) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSave() {
    if (!item || !form || !itemId || saving) return;

    setSaving(true);
    setSaveError('');

    try {
      const updated = await updateSecurityItem(itemId, {
        title: form.title.trim(),
        category: form.category.trim(),
        dateFound: form.dateFound,
        locationFound: form.locationFound.trim() || null,
        descriptionInternal: form.description.trim() || null,
      });
      setItem(updated);
      setEditing(false);
      setForm(null);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Failed to save item changes.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDispose() {
    if (!itemId || disposing) return;

    setDisposing(true);
    setDisposeError('');

    try {
      const updated = await updateSecurityItemStatus(itemId, {
        status: 'disposed',
      });
      setItem(updated);
      setDisposeDialogOpen(false);
    } catch (err) {
      setDisposeError(
        err instanceof Error ? err.message : 'Failed to mark item as disposed.'
      );
    } finally {
      setDisposing(false);
    }
  }

  if (loading) {
    return (
      <Flex justify="center" py={16}>
        <Spinner size="lg" color="blue.500" />
      </Flex>
    );
  }

  if (error || !item) {
    return (
      <Stack gap={4} py={12} align="center">
        <Text color="red.500" fontSize="md">
          {error || 'Item not found.'}
        </Text>
        <Button variant="muted" onClick={handleCancel}>
          Back to List
        </Button>
      </Stack>
    );
  }

  const registrantName =
    `${item.registeredBy.firstName} ${item.registeredBy.lastName}`.trim() ||
    PLACEHOLDER;
  const description =
    item.descriptionInternal ?? item.descriptionPublic ?? PLACEHOLDER;

  const canDispose = DISPOSABLE_STATUSES.has(item.status);

  return (
    <Stack gap={6}>
      <Flex
        justify="space-between"
        align={{ base: 'flex-start', md: 'center' }}
        direction={{ base: 'column', md: 'row' }}
        gap={4}
      >
        <Stack gap={2}>
          <Heading
            as="h1"
            fontSize={{ base: '2xl', md: '3xl' }}
            fontWeight="bold"
            color="gray.900"
          >
            Item Details
          </Heading>
          <Text fontSize="sm" color="gray.600">
            Review and update found item information.
          </Text>
        </Stack>
        {!editing && item.status === 'stored' ? (
          <Button
            {...actionButtonStyles}
            variant="outline"
            disabled={navigatingToRelease}
            loading={navigatingToRelease}
            flexShrink={0}
            onClick={() => {
              setNavigatingToRelease(true);
              router.push(`/security/items/${itemId}/walk-in-release`);
            }}
          >
            Walk-in Release
          </Button>
        ) : null}
      </Flex>

      <Box
        bg="white"
        borderRadius="lg"
        borderWidth="1px"
        borderColor="gray.200"
        p={6}
        position="relative"
      >
        <Box position="absolute" top={6} right={6}>
          <ItemStatusBadge status={item.status} size="md" />
        </Box>

        <Box
          pb={5}
          mb={5}
          borderBottomWidth="1px"
          borderColor="gray.100"
          pr={{ base: 28, sm: 32 }}
        >
          <Stack gap={2} flex={1} minW={0}>
            {editing && form ? (
              <Stack gap={4}>
                <ItemDetailRow
                  label="Item name"
                  value={form.title}
                  input={
                    <Input
                      {...editInputStyles}
                      value={form.title}
                      onChange={(e) =>
                        handleFormChange('title', e.target.value)
                      }
                    />
                  }
                />
                <ItemDetailRow
                  label="Category"
                  value={form.category}
                  input={
                    <NativeSelect.Root size="sm">
                      <NativeSelect.Field
                        {...editInputStyles}
                        value={form.category}
                        onChange={(e) =>
                          handleFormChange('category', e.target.value)
                        }
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                  }
                />
              </Stack>
            ) : (
              <>
                <Heading
                  as="h2"
                  fontSize={{ base: 'xl', md: '2xl' }}
                  fontWeight="bold"
                  color="gray.900"
                  lineHeight="short"
                >
                  {item.title}
                </Heading>
                <Badge
                  colorPalette="gray"
                  variant="subtle"
                  fontSize="sm"
                  fontWeight="medium"
                  px={3}
                  py={1}
                  borderRadius="full"
                  w="fit-content"
                >
                  {item.category}
                </Badge>
              </>
            )}
          </Stack>
        </Box>

        <Grid
          templateColumns={{ base: '1fr', sm: '1fr auto' }}
          gap={6}
          alignItems="start"
        >
          <Stack gap={editing ? 6 : 8} minW={0}>
            {editing && form ? (
              <>
                <ItemDetailRow
                  label="Date found"
                  value={form.dateFound}
                  input={
                    <Input
                      {...editInputStyles}
                      type="date"
                      value={form.dateFound}
                      onChange={(e) =>
                        handleFormChange('dateFound', e.target.value)
                      }
                    />
                  }
                />
                <ItemDetailRow
                  label="Location found"
                  value={form.locationFound}
                  input={
                    <Input
                      {...editInputStyles}
                      value={form.locationFound}
                      onChange={(e) =>
                        handleFormChange('locationFound', e.target.value)
                      }
                    />
                  }
                />
              </>
            ) : (
              <>
                <ItemDetailRow
                  label="Date found"
                  value={formatDate(item.dateFound)}
                />
                <ItemDetailRow
                  label="Location found"
                  value={item.locationFound ?? PLACEHOLDER}
                />
              </>
            )}
            <ItemDetailRow label="Storage campus" value={item.campusName} />
            <ItemDetailRow label="Registrant" value={registrantName} />
            {editing && form ? (
              <ItemDetailRow
                label="Description"
                value={form.description}
                input={
                  <Textarea
                    {...editInputStyles}
                    minH="72px"
                    py={2}
                    rows={3}
                    resize="vertical"
                    value={form.description}
                    onChange={(e) =>
                      handleFormChange('description', e.target.value)
                    }
                  />
                }
              />
            ) : (
              <ItemDetailRow label="Description" value={description} />
            )}
          </Stack>

          <DetailImageGallery images={item.images} alt={item.title} />
        </Grid>
      </Box>

      {saveError ? (
        <Text fontSize="sm" color="red.500" textAlign="right">
          {saveError}
        </Text>
      ) : null}

      <Dialog.Root
        open={disposeDialogOpen}
        onOpenChange={(e) => {
          if (!e.open && !disposing) {
            setDisposeDialogOpen(false);
            setDisposeError('');
          }
        }}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content maxW="md">
              <Dialog.Header>
                <Dialog.Title>Mark item as disposed?</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <Stack gap={3}>
                  <Text fontSize="sm" color="gray.700">
                    Confirm that <strong>{item.title}</strong> has been disposed
                    of in person. This updates the item status and cannot be
                    undone.
                  </Text>
                  {disposeError ? (
                    <Text fontSize="sm" color="red.500">
                      {disposeError}
                    </Text>
                  ) : null}
                </Stack>
              </Dialog.Body>
              <Dialog.Footer>
                <Button
                  variant="muted"
                  onClick={() => setDisposeDialogOpen(false)}
                  disabled={disposing}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  loading={disposing}
                  loadingText="Disposing..."
                  onClick={handleDispose}
                  disabled={disposing}
                >
                  Confirm Disposal
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      <Flex
        justify="space-between"
        align="center"
        gap={3}
        wrap="wrap"
        pt={2}
        borderTopWidth="1px"
        borderColor="gray.200"
      >
        <Button
          {...actionButtonStyles}
          variant="muted"
          onClick={editing ? handleCancelEdit : handleCancel}
          disabled={saving}
        >
          {editing ? 'Cancel' : 'Back to List'}
        </Button>

        <Flex gap={3} wrap="wrap" justify="flex-end">
          {editing ? (
            <Button
              {...actionButtonStyles}
              variant="primary"
              onClick={handleSave}
              loading={saving}
              loadingText="Saving..."
              disabled={saving}
            >
              Save Changes
            </Button>
          ) : (
            <>
              {canDispose ? (
                <Menu.Root>
                  <Menu.Trigger asChild>
                    <Button {...actionButtonStyles} variant="muted">
                      More actions
                    </Button>
                  </Menu.Trigger>
                  <Menu.Positioner>
                    <Menu.Content minW="180px">
                      <Menu.Item
                        value="dispose"
                        fontSize="sm"
                        color="red.600"
                        _highlighted={{ bg: 'red.50' }}
                        onClick={() => {
                          setDisposeError('');
                          setDisposeDialogOpen(true);
                        }}
                      >
                        Mark as disposed
                      </Menu.Item>
                    </Menu.Content>
                  </Menu.Positioner>
                </Menu.Root>
              ) : null}
              <Button
                {...actionButtonStyles}
                variant="primary"
                onClick={handleStartEdit}
              >
                Edit Item
              </Button>
            </>
          )}
        </Flex>
      </Flex>
    </Stack>
  );
}
