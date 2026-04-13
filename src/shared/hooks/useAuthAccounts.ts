import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { authClient } from '@/shared/lib/authClient';

export interface AuthAccountSummary {
 providerId: string;
}

export const useAuthAccounts = (enabled = true) => {
 const [accounts, setAccounts] = useState<AuthAccountSummary[]>([]);
 const [isLoading, setIsLoading] = useState(enabled);
 const [error, setError] = useState<string | null>(null);
 const parseAccountsResponse = (result: unknown): AuthAccountSummary[] => {
  const responseRecord = (result && typeof result === 'object')
   ? result as Record<string, unknown>
   : null;
  const nestedData = responseRecord?.data && typeof responseRecord.data === 'object'
   ? responseRecord.data as Record<string, unknown>
   : null;
  const payload = Array.isArray(result)
   ? result
   : Array.isArray(responseRecord?.data)
    ? responseRecord.data
    : Array.isArray(nestedData?.data)
     ? nestedData.data
     : null;

  if (!payload) {
   throw new Error('Invalid Better Auth accounts response.');
  }

  return payload.map((account, index) => {
   const record = account as Record<string, unknown>;
   const providerId = typeof record.providerId === 'string'
    ? record.providerId
    : typeof record.provider_id === 'string'
     ? record.provider_id
     : '';

   if (!providerId) {
    throw new Error(`Invalid Better Auth account payload at index ${index}.`);
   }

   return { providerId };
  });
 };

 const loadAccounts = useCallback(async (isMounted?: () => boolean) => {
  if (!enabled) {
   if (!isMounted || isMounted()) {
    setAccounts([]);
    setIsLoading(false);
    setError(null);
   }
   return;
  }

  if (!isMounted || isMounted()) {
   setIsLoading(true);
   setError(null);
  }

  try {
   const result = await authClient.listAccounts();
   if (isMounted && !isMounted()) {
    return;
   }
   const parsed = parseAccountsResponse(result);

   if (!isMounted || isMounted()) {
    setAccounts(parsed);
   }
  } catch (loadError) {
   if (!isMounted || isMounted()) {
    setError(loadError instanceof Error ? loadError.message : String(loadError));
   }
  } finally {
   if (!isMounted || isMounted()) {
    setIsLoading(false);
   }
  }
 }, [enabled]);

 useEffect(() => {
  let isMounted = true;
  void loadAccounts(() => isMounted);

  return () => {
   isMounted = false;
  };
 }, [loadAccounts]);

 const hasPasswordAccount = useMemo(
  () => accounts.some((account) => account.providerId === 'credential'),
  [accounts]
 );

 return {
  accounts,
  hasPasswordAccount,
  isLoading,
  error,
  reload: loadAccounts
 };
};
