'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAccessToken } from '@/utils/auth';
import handleImageUpload from '@/utils/handleImageUpload';
import { createSecurityItem } from '@/lib/api/items';
import type { SubmitImageRef } from '@/lib/api/photoSessions';
import { todayISO, validateFoundItemFields } from '@/utils/foundItemForm';

export function useSecurityFoundItemForm(defaultCampusId = '') {
  const router = useRouter();

  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(todayISO);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [campusIdOverride, setCampusId] = useState<string | null>(null);
  const campusId = campusIdOverride ?? defaultCampusId;
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [sessionImages, setSessionImages] = useState<SubmitImageRef[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function clearError(field: string) {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function validate(): boolean {
    const next = validateFoundItemFields(
      { itemName, category, date, location, description },
      {
        requireCampus: true,
        campus: campusId,
      }
    );

    if (!campusId.trim()) {
      next.campus = 'Storage campus is a required field';
    }

    if (imageFiles.length + sessionImages.length === 0) {
      next.images = 'At least one photo is required';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (isSubmitting) return;

    setSubmitError(null);
    if (!validate()) return;

    const accessToken = getAccessToken();
    if (!accessToken) {
      router.push('/login?redirect=/security/report-found');
      return;
    }

    setIsSubmitting(true);
    try {
      const uploadedImages: SubmitImageRef[] = [...sessionImages];

      for (const file of imageFiles) {
        const result = await handleImageUpload(file, accessToken);
        uploadedImages.push({
          imageUrl: result.imageUrl,
          fileType: result.fileType,
          fileSizeKb: result.fileSizeKb,
        });
      }

      await createSecurityItem({
        campusId,
        title: itemName.trim(),
        description: description.trim(),
        category: category.trim(),
        locationFound: location.trim(),
        dateFound: date,
        images: uploadedImages,
      });

      router.push('/security/items');
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Something went wrong submitting your report. Please try again.'
      );
      setIsSubmitting(false);
    }
  }

  function handleCancel() {
    router.push('/security/items');
  }

  return {
    itemName,
    setItemName,
    category,
    setCategory,
    date,
    setDate,
    location,
    setLocation,
    description,
    setDescription,
    campusId,
    setCampusId,
    imageFiles,
    setImageFiles,
    sessionImages,
    setSessionImages,
    errors,
    clearError,
    isSubmitting,
    submitError,
    todayISO,
    handleSubmit,
    handleCancel,
  };
}
