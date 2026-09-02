import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';

/**
 * Whether the technician is marked available for work today.
 *
 * Shared by the sidebar action and the settings toggle so the two cannot
 * disagree.
 *
 * Backend quirk worth knowing: on the first change of a given day
 * changeUserStatus creates the record with `typ` hardcoded to 1 while still
 * echoing back whatever was requested — so the response cannot be trusted and
 * the real state is read back after every change.
 */
export function useAvailability() {
  const { user } = useAuth();
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const response = await apiClient.getUserStatus(user.id);
      setIsAvailable(
        Boolean(response.activity?.activeStatus ?? response.data?.activity?.activeStatus),
      );
    } catch (error) {
      console.error('Failed to read availability:', error);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setAvailable = useCallback(
    async (next: boolean) => {
      if (!user) return;
      setIsBusy(true);
      try {
        await apiClient.changeUserStatus(user.id, next ? 1 : 0);
        await refresh();
        toast.success(next ? 'Als verfügbar markiert' : 'Als nicht verfügbar markiert');
      } catch (error) {
        console.error('Failed to change availability:', error);
        toast.error('Status konnte nicht geändert werden');
        await refresh();
      } finally {
        setIsBusy(false);
      }
    },
    [user, refresh],
  );

  const toggle = useCallback(
    () => setAvailable(!isAvailable),
    [isAvailable, setAvailable],
  );

  return { isAvailable, isBusy, setAvailable, toggle, refresh };
}
