'use client';

import { useEffect, useState } from 'react';
import { fetchLoggedInUserProfile, getLoggedInDisplayName } from '@/utils/auth';

export function useLoggedInDisplayName(): string {
  const [displayName, setDisplayName] = useState(
    () => getLoggedInDisplayName() ?? ''
  );

  useEffect(() => {
    void fetchLoggedInUserProfile().then((profile) => {
      if (profile?.firstName) {
        setDisplayName(`${profile.firstName} ${profile.lastName}`.trim());
      }
    });
  }, []);

  return displayName;
}
