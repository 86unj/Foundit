'use client';

import { Box } from '@chakra-ui/react';
import { PAGE_BACKGROUND_PROPS } from '@/constants/pageBackground';

interface FixedPageBackgroundProps {
  /** Extra dim layer on top of bg.svg (which already has a built-in overlay). */
  overlay?: boolean;
}

/** Viewport-fixed page backdrop — always covers, including tall windows. */
export function FixedPageBackground({
  overlay = false,
}: FixedPageBackgroundProps) {
  return (
    <>
      <Box
        position="fixed"
        inset={0}
        zIndex={0}
        pointerEvents="none"
        aria-hidden
        {...PAGE_BACKGROUND_PROPS}
      />
      {overlay && (
        <Box
          position="fixed"
          inset={0}
          bg="blackAlpha.700"
          zIndex={0}
          pointerEvents="none"
          aria-hidden
        />
      )}
    </>
  );
}
