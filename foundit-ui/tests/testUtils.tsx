import { cleanup, render } from '@testing-library/react';
import { afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { Provider } from '@/components/ui/provider';

// Vitest runs without globals, so testing-library's automatic DOM cleanup
// never registers — do it explicitly or renders accumulate across tests.
afterEach(cleanup);

// jsdom lacks these browser APIs that Chakra v3 / next-themes touch.
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }

  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
}

/** Renders a component inside the app's Chakra provider. */
export function renderWithProvider(ui: ReactElement) {
  return render(<Provider>{ui}</Provider>);
}
