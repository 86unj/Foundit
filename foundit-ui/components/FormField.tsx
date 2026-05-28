'use client';

import React from 'react';
import { Box, Grid, HStack, Text } from '@chakra-ui/react';
import { fieldColors } from './form/fieldStyles';

export type FormFieldLayout = 'horizontal' | 'vertical';

/**
 * Layout shell for report/claim form rows (select, textarea, upload, read-only).
 * Text fields use TextInput instead — it owns its own label, hint, and error UI.
 */
export interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  /** Read-only row (e.g. Finder / Registrant). */
  displayValue?: string;
  layout?: FormFieldLayout;
  labelWidth?: string;
  optionalText?: string;
  children?: React.ReactNode;
  mb?: number;
}

function Label({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text
      as="span"
      fontSize="0.875rem"
      fontWeight="medium"
      lineHeight="1.6"
      color={fieldColors.label}
    >
      {label}
      {required && (
        <Text as="span" color={fieldColors.required} ml={0.5} aria-hidden>
          *
        </Text>
      )}
    </Text>
  );
}

export function FormField({
  label,
  required = false,
  error,
  displayValue,
  layout = 'horizontal',
  labelWidth = '180px',
  optionalText,
  children,
  mb = 6,
}: FormFieldProps) {
  const control = displayValue ? (
    <Text fontSize="1rem" color={fieldColors.text} py={2}>
      {displayValue}
    </Text>
  ) : (
    children
  );

  const errorMessage = error ? (
    <Text
      fontSize="0.875rem"
      fontWeight="semibold"
      color={fieldColors.error}
      mt={1.5}
      role="alert"
    >
      {error}
    </Text>
  ) : null;

  if (layout === 'vertical') {
    return (
      <Box mb={mb}>
        <HStack justify="space-between" align="baseline" mb={1.5}>
          <Label label={label} required={required} />
          {optionalText && (
            <Text
              fontSize="0.875rem"
              color={fieldColors.optional}
              fontWeight="medium"
            >
              {optionalText}
            </Text>
          )}
        </HStack>
        {control}
        {errorMessage}
      </Box>
    );
  }

  return (
    <Box mb={mb}>
      <Grid
        templateColumns={{ base: '1fr', md: `${labelWidth} 1fr` }}
        gap={{ base: 1.5, md: 4 }}
        alignItems="start"
      >
        <Box
          textAlign={{ base: 'start', md: 'end' }}
          pt={{ base: 0, md: displayValue ? 2 : 2.5 }}
          pr={{ base: 0, md: 2 }}
        >
          <Label label={label} required={required} />
        </Box>

        <Box w="full" minW={0}>
          {optionalText && (
            <Text
              fontSize="0.875rem"
              color={fieldColors.optional}
              fontWeight="medium"
              textAlign="right"
              mb={1}
            >
              {optionalText}
            </Text>
          )}
          {control}
          {errorMessage}
        </Box>
      </Grid>
    </Box>
  );
}

export default FormField;
