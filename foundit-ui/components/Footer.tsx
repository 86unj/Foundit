'use client';
import { Box, Flex, HStack, Link, Text } from '@chakra-ui/react';

export default function Footer() {
  return (
    // position+zIndex keep the footer above full-viewport fixed backdrops
    // (e.g. the claim-item hero overlay) without changing its layout.
    <Box
      as="footer"
      bg="black"
      color="gray.400"
      px={8}
      h="85px"
      w="100%"
      position="relative"
      zIndex={1}
    >
      <Flex maxW="1200px" mx="auto" h="100%" align="center">
        {/* Left Side */}
        <Text fontSize="sm">© 2026 FoundIt. All rights reserved.</Text>

        {/* Right Side */}
        {/* <HStack ml="auto" gap={8}>
          <Link href="#" fontSize="sm" color="gray.400">
            Privacy Policy
          </Link>

          <Link href="#" fontSize="sm" color="gray.400">
            Terms of Service
          </Link>

          <Link href="#" fontSize="sm" color="gray.400">
            Contact
          </Link>
        </HStack> */}
      </Flex>
    </Box>
  );
}
