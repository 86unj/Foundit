'use client';

import { useState } from 'react';
import { Button as ChakraButton, Box, Flex, Stack } from '@chakra-ui/react';
import type { MatchSuggestion, SecurityClaimListItem } from '@/types/claims';
import { Button } from '@/components/ui/Button';
import { CloseClaimButton } from './CloseClaimButton';
import { ClaimCard } from './ClaimCard';
import { ClaimManualSearchList } from './ClaimManualSearchList';
import { ClaimMatchCard } from './ClaimMatchCard';
import { ClaimMatchEmptyState } from './ClaimMatchEmptyState';

type MatchPanelVariant = 'awaiting' | 'review';

interface ClaimMatchPanelProps {
  claim: SecurityClaimListItem;
  variant: MatchPanelVariant;
  suggestions: MatchSuggestion[];
  selectedItemId: string | null;
  onSelectItem: (itemId: string | null) => void;
  onConfirmMatch: () => void | Promise<void>;
  onCloseClaim?: () => void;
  generating?: boolean;
  confirming?: boolean;
}

const AI_PAGE_SIZE = 3;

const tabStyles = {
  px: 4,
  py: 2,
  fontSize: 'sm',
  fontWeight: 'medium',
  borderRadius: 'md',
  cursor: 'pointer',
} as const;

export function ClaimMatchPanel({
  claim,
  variant,
  suggestions,
  selectedItemId,
  onSelectItem,
  onConfirmMatch,
  onCloseClaim,
  generating = false,
  confirming = false,
}: ClaimMatchPanelProps) {
  const [activeTab, setActiveTab] = useState<'ai' | 'manual'>('ai');
  const [aiVisibleCount, setAiVisibleCount] = useState(AI_PAGE_SIZE);
  const [suggestionsSnapshot, setSuggestionsSnapshot] = useState(suggestions);

  // Reset pagination when the suggestions list identity changes (render-time
  // adjustment — avoids setState-in-effect cascading renders).
  if (suggestions !== suggestionsSnapshot) {
    setSuggestionsSnapshot(suggestions);
    setAiVisibleCount(AI_PAGE_SIZE);
  }

  const canConfirm = Boolean(selectedItemId);
  const showMatchActions = variant === 'review' || canConfirm;
  const showFooter = showMatchActions || Boolean(onCloseClaim);
  const visibleSuggestions = suggestions.slice(0, aiVisibleCount);
  const hasMoreAiMatches = suggestions.length > aiVisibleCount;

  function handleSelectItem(itemId: string) {
    onSelectItem(selectedItemId === itemId ? null : itemId);
  }

  return (
    <ClaimCard>
      <Flex
        gap={2}
        mb={4}
        borderBottomWidth="1px"
        borderColor="gray.200"
        pb={2}
      >
        <ChakraButton
          {...tabStyles}
          variant="ghost"
          bg={activeTab === 'ai' ? 'gray.100' : 'transparent'}
          color={activeTab === 'ai' ? 'gray.900' : 'gray.600'}
          onClick={() => setActiveTab('ai')}
        >
          AI Matches
        </ChakraButton>
        <ChakraButton
          {...tabStyles}
          variant="ghost"
          bg={activeTab === 'manual' ? 'gray.100' : 'transparent'}
          color={activeTab === 'manual' ? 'gray.900' : 'gray.600'}
          onClick={() => setActiveTab('manual')}
        >
          Manual Search
        </ChakraButton>
      </Flex>

      {activeTab === 'ai' ? (
        suggestions.length > 0 ? (
          <Stack gap={3}>
            {visibleSuggestions.map((match, index) => (
              <ClaimMatchCard
                key={match.matchId}
                match={match}
                rank={index + 1}
                isBestMatch={index === 0}
                selected={selectedItemId === match.itemId}
                onSelect={() => handleSelectItem(match.itemId)}
              />
            ))}
            {hasMoreAiMatches ? (
              <Flex justify="center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setAiVisibleCount((count) => count + AI_PAGE_SIZE)
                  }
                >
                  Show more
                </Button>
              </Flex>
            ) : null}
          </Stack>
        ) : (
          <ClaimMatchEmptyState searching={generating} />
        )
      ) : (
        <ClaimManualSearchList
          claim={claim}
          selectedItemId={selectedItemId}
          onSelectItem={handleSelectItem}
        />
      )}

      {showFooter ? (
        <Flex
          mt={6}
          pt={4}
          borderTopWidth="1px"
          borderColor="gray.200"
          gap={3}
          flexWrap="wrap"
          justify="space-between"
          align="center"
        >
          {onCloseClaim ? <CloseClaimButton onClick={onCloseClaim} /> : <Box />}
          {showMatchActions ? (
            <Button
              variant="primary"
              disabled={!canConfirm || confirming}
              loading={confirming}
              onClick={() => void onConfirmMatch()}
            >
              Confirm Match
            </Button>
          ) : null}
        </Flex>
      ) : null}
    </ClaimCard>
  );
}
