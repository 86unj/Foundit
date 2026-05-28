import type { SystemStyleObject } from '@chakra-ui/react';

/** Shared palette for form labels, borders, focus, and errors (matches mockups + TextInput). */
export const fieldColors = {
  label: '#666666',
  text: '#1a1a1a',
  hint: '#666666',
  error: '#cd0000',
  border: '#D9D9D9',
  focusRing: '#009adb',
  required: '#cd0000',
  optional: 'blue.500',
  uploadBg: '#EFF6FF',
  uploadLink: 'blue.500',
} as const;

/** Base styles for single-line inputs and select triggers. */
export const inputControlStyles: SystemStyleObject = {
  h: 12,
  px: 4,
  fontSize: '1rem',
  fontWeight: 'normal',
  color: fieldColors.text,
  bg: 'white',
  borderWidth: '1px',
  borderRadius: 'md',
  borderColor: fieldColors.border,
  _invalid: { borderColor: fieldColors.error },
  _focusVisible: {
    outline: 'none',
    boxShadow: `0 0 0 2px ${fieldColors.focusRing}`,
    borderColor: 'inherit',
  },
  w: '100%',
};

/** Base styles for multi-line description fields. */
export const textareaControlStyles: SystemStyleObject = {
  ...inputControlStyles,
  h: 'auto',
  minH: '120px',
  py: 3,
  resize: 'vertical',
};

export const widthMap = {
  '2-char': '8ex',
  '3-char': '10ex',
  '4-char': '12ex',
  '5-char': '14ex',
  '7-char': '17ex',
  '10-char': '23ex',
  '20-char': '41ex',
  full: '100%',
} as const;

export type WidthVariant = keyof typeof widthMap;
