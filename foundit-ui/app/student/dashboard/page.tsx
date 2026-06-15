'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Heading,
  HStack,
  NativeSelect,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useLoggedInDisplayName } from '@/hooks/useLoggedInDisplayName';

interface FoundItem {
  category: string;
  item: string;
  count: number;
}

export default function StudentDashboardPage() {
  const displayName = useLoggedInDisplayName();
  const [foundItems, setFoundItems] = useState<FoundItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFoundItems() {
      try {
        // API Integration Note:
        // This fetch call connects the frontend dashboard to the backend API.
        // Current API endpoint: http://localhost:3001/api/found-items
        // Expected backend response format:
        // [
        //   {
        //     category: 'Electronics',
        //     item: 'Keyboard',
        //     count: 5
        //   }
        // ]
        // Later, this URL can be moved into an environment variable,
        // for example: process.env.NEXT_PUBLIC_API_URL
        const response = await fetch('http://localhost:3001/api/found-items');
        const data = await response.json();
        setFoundItems(data);
      } catch (error) {
        console.error('Failed to fetch found items:', error);
        // Temporary fallback data:
        // Remove or replace this after the backend is fully connected.
        setFoundItems([
          { category: 'Electronics', item: 'Keyboard', count: 5 },
          { category: 'Cards', item: 'Student ID', count: 5 },
          { category: 'Clothing', item: 'Hoodie', count: 2 },
        ]);
      } finally {
        setLoading(false);
      }
    }

    fetchFoundItems();
  }, []);

  if (loading) {
    return (
      <Box
        minH="50vh"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Spinner size="xl" color="blue.500" />
      </Box>
    );
  }

  return (
    <Box
      mt="-40px"
      mb="-40px"
      minH="100vh"
      w="100vw"
      maxW="none"
      mx="calc(50% - 50vw)"
      backgroundImage="url('/bg.svg')"
      backgroundSize="cover"
      backgroundPosition="center"
      backgroundRepeat="no-repeat"
      px={{ base: 4, md: 10 }}
      py={10}
    >
      <Stack gap={6} maxW="1100px" mx="auto">
        {/* Dashboard Header */}
        <Box textAlign="center" color="white">
          <Text fontSize="24px" fontWeight="700" lineHeight="36px" mb={2}>
            Found item dash board
          </Text>
          <Heading as="h1" fontSize="40px" fontWeight="700" lineHeight="48px">
            Hello, {displayName}
          </Heading>
        </Box>

        {/* Main Dashboard Card */}
        <Box bg="white" borderRadius="lg" p={{ base: 5, md: 8 }}>
          {/* Filter Section */}
          <HStack justify="flex-end" gap={4} mb={4}>
            <NativeSelect.Root w="170px">
              <NativeSelect.Field>
                <option>Period</option>
                <option>Today</option>
                <option>This Week</option>
                <option>This Month</option>
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
            <NativeSelect.Root w="190px">
              <NativeSelect.Field>
                <option>Campus Option</option>
                <option>Newnham</option>
                <option>Seneca@York</option>
                <option>King</option>
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </HStack>

          {/* Found Items Display Area */}
          <Box
            bg="gray.100"
            borderRadius="md"
            p={{ base: 4, md: 8 }}
            minH="230px"
          >
            <SimpleGrid columns={{ base: 1, md: 3 }} gap={8}>
              {foundItems.map((foundItem, index) => (
                <HStack
                  key={index}
                  bg="blue.50"
                  borderRadius="md"
                  px={4}
                  py={2}
                  justify="space-between"
                  fontSize="sm"
                >
                  <Text>
                    <Text as="span" color="blue.500" fontWeight="bold">
                      {foundItem.category}
                    </Text>{' '}
                    |{' '}
                    <Text as="span" fontWeight="bold">
                      {foundItem.item}
                    </Text>
                  </Text>
                  <Text color="blue.500" fontWeight="bold">
                    {foundItem.count}
                  </Text>
                </HStack>
              ))}
            </SimpleGrid>
          </Box>
        </Box>

        {/* Claim Button */}
        <Button
          bg="blue.500"
          color="white"
          size="lg"
          w="220px"
          alignSelf="center"
          _hover={{ bg: 'blue.600' }}
        >
          Claim Items
        </Button>
      </Stack>
    </Box>
  );
}
