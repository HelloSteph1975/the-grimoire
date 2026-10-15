import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// Vitest runs without globals, so Testing Library can't register its own cleanup.
afterEach(() => cleanup());
configure({ asyncUtilTimeout: 5000 });
