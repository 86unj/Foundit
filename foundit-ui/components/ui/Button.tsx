'use client';

import React from 'react';
import {
  Button as ChakraButton,
  type ButtonProps as ChakraButtonProps,
} from '@chakra-ui/react';

export type ButtonVariant = 'primary' | 'outline' | 'muted' | 'danger';

const chakraVariantMap: Record<
  ButtonVariant,
  Pick<ChakraButtonProps, 'variant' | 'colorPalette' | 'borderWidth' | 'color'>
> = {
  primary: { variant: 'solid', colorPalette: 'blue' },
  outline: {
    variant: 'outline',
    colorPalette: 'blue',
    borderWidth: 1.5,
    color: 'blue.600',
  },
  muted: {
    variant: 'outline',
    colorPalette: 'gray',
    borderWidth: 1.5,
    color: 'gray.400',
  },
  danger: { variant: 'solid', colorPalette: 'red' },
};

export type ButtonProps = Omit<
  ChakraButtonProps,
  'variant' | 'colorPalette'
> & {
  variant?: ButtonVariant;
  borderWidth?: number;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ variant = 'primary', ...props }, ref) {
    return <ChakraButton ref={ref} {...chakraVariantMap[variant]} {...props} />;
  }
);

export default Button;
