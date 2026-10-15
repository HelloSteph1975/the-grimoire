import { useCallback, useEffect, useId } from 'react';
import { useLeaveGuardRegistry } from '../components/LeaveGuardProvider.jsx';

// Asks before leaving a form with unsaved changes, inside the app and when closing the tab.
// Registers this form with the app's LeaveGuardProvider, which does the asking.
// Call markSaved() right before navigating away after a successful save.
export function useLeaveGuard(dirty) {
  const registry = useLeaveGuardRegistry();
  if (!registry) throw new Error('useLeaveGuard needs a LeaveGuardProvider above it.');
  const id = useId();
  useEffect(() => { registry.set(id, dirty); }, [registry, id, dirty]);
  useEffect(() => () => registry.remove(id), [registry, id]);
  return useCallback(() => registry.markSaved(id), [registry, id]);
}
