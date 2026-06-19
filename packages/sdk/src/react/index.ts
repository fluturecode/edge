import { useState, useEffect, useCallback, useRef } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { EdgePass } from '../core/EdgePass';
import {
  EdgePassObject,
  TransactionRequest,
  TransactionOutcome,
  SimulationResult,
  BudgetStatus,
  Network,
} from '../utils/types';

export interface UseEdgePassConfig {
  passId:        string;
  network:       Network;
  enokiApiKey:   string;
  signer?:       { signAndExecute: (tx: Transaction) => Promise<{ digest: string }> };
  autoRefresh?:  boolean;
  pollInterval?: number;
}

export interface UseEdgePassResult {
  pass:         EdgePassObject | null;
  loading:      boolean;
  error:        Error | null;
  execute:      (request: TransactionRequest) => Promise<TransactionOutcome>;
  simulate:     (requests: TransactionRequest[]) => SimulationResult | null;
  budgetStatus: BudgetStatus | null;
  refresh:      () => Promise<void>;
  sdk:          EdgePass;
}

export function useEdgePass({
  passId,
  network,
  enokiApiKey,
  signer,
  autoRefresh = true,
  pollInterval = 0,
}: UseEdgePassConfig): UseEdgePassResult {

  const [pass, setPass] = useState<EdgePassObject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const sdkRef = useRef<EdgePass>(new EdgePass({ network, enokiApiKey }));
  useEffect(() => {
    sdkRef.current = new EdgePass({ network, enokiApiKey });
  }, [network, enokiApiKey]);

  const refresh = useCallback(async () => {
    if (!passId) return;
    try {
      setError(null);
      const fetched = await sdkRef.current.fetch(passId);
      setPass(fetched);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [passId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    sdkRef.current.fetch(passId)
      .then(fetched => { if (!cancelled) { setPass(fetched); setError(null); } })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e : new Error(String(e))); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [passId]);

  useEffect(() => {
    if (!pollInterval || pollInterval <= 0) return;
    const interval = setInterval(refresh, pollInterval);
    return () => clearInterval(interval);
  }, [refresh, pollInterval]);

  const execute = useCallback(async (request: TransactionRequest): Promise<TransactionOutcome> => {
    if (!pass) throw new Error('EdgePass not loaded');
    if (!signer) throw new Error('No signer provided');
    const outcome = await sdkRef.current.execute(pass, request, signer);
    if (outcome.status === 'approved' && autoRefresh) await refresh();
    return outcome;
  }, [pass, signer, autoRefresh, refresh]);

  const simulate = useCallback((requests: TransactionRequest[]): SimulationResult | null => {
    if (!pass) return null;
    return sdkRef.current.simulate(pass, requests);
  }, [pass]);

  const budgetStatus = pass ? sdkRef.current.budgetStatus(pass) : null;

  return { pass, loading, error, execute, simulate, budgetStatus, refresh, sdk: sdkRef.current };
}

export function useBudgetStatus(config: UseEdgePassConfig): BudgetStatus | null {
  const { budgetStatus } = useEdgePass(config);
  return budgetStatus;
}

export function useSimulate(
  config: UseEdgePassConfig,
  requests: TransactionRequest[]
): SimulationResult | null {
  const { simulate } = useEdgePass(config);
  return simulate(requests);
}