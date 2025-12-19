import { useState, useCallback, useEffect } from 'react';
import { Signer } from '@waves/signer';
import { ProviderKeeper } from '@waves/provider-keeper';
import { config } from '../config';
import type { WavesWalletState } from '../types';

let signerInstance: Signer | null = null;

export function useWavesWallet() {
  const [state, setState] = useState<WavesWalletState>({
    connected: false,
    address: null,
    publicKey: null,
  });
  const [signer, setSigner] = useState<Signer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isKeeperInstalled, setIsKeeperInstalled] = useState(false);

  // Check if Keeper is installed
  useEffect(() => {
    const checkKeeper = () => {
      // @ts-ignore - WavesKeeper is injected
      setIsKeeperInstalled(typeof window !== 'undefined' && !!window.WavesKeeper);
    };

    checkKeeper();
    // Check again after a delay (Keeper might load slowly)
    const timeout = setTimeout(checkKeeper, 1000);
    return () => clearTimeout(timeout);
  }, []);

  // Connect wallet
  const connect = useCallback(async () => {
    try {
      setError(null);

      // Create signer if not exists
      if (!signerInstance) {
        signerInstance = new Signer({
          NODE_URL: config.waves.nodeUrl,
        });
      }

      // Set provider (Keeper)
      const keeper = new ProviderKeeper();
      signerInstance.setProvider(keeper);

      // Login
      const userData = await signerInstance.login();

      setSigner(signerInstance);
      setState({
        connected: true,
        address: userData.address,
        publicKey: userData.publicKey,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to connect WAVES wallet';
      setError(message);
      console.error('WAVES wallet connection error:', err);
    }
  }, []);

  // Disconnect wallet
  const disconnect = useCallback(async () => {
    try {
      if (signerInstance) {
        await signerInstance.logout();
      }
    } catch (err) {
      console.error('Logout error:', err);
    }

    signerInstance = null;
    setSigner(null);
    setState({
      connected: false,
      address: null,
      publicKey: null,
    });
  }, []);

  // Sign and broadcast invoke script transaction
  const invokeScript = useCallback(
    async (params: {
      dApp: string;
      call: {
        function: string;
        args: Array<{ type: string; value: unknown }>;
      };
      payment?: Array<{ assetId: string | null; amount: number }>;
    }) => {
      if (!signer) {
        throw new Error('Wallet not connected');
      }

      // Cast to any to work around strict type checking in waves library
      const tx = signer.invoke({
        dApp: params.dApp,
        call: params.call as any,
        payment: params.payment || [],
      });

      const result = await tx.broadcast();
      return result;
    },
    [signer]
  );

  // Get balance
  const getBalance = useCallback(
    async (assetId?: string): Promise<number> => {
      if (!state.address) return 0;

      try {
        const url = assetId
          ? `${config.waves.nodeUrl}/assets/balance/${state.address}/${assetId}`
          : `${config.waves.nodeUrl}/addresses/balance/${state.address}`;

        const response = await fetch(url);
        const data = await response.json();

        return assetId ? data.balance : data.balance;
      } catch (err) {
        console.error('Failed to get balance:', err);
        return 0;
      }
    },
    [state.address]
  );

  return {
    ...state,
    signer,
    error,
    isKeeperInstalled,
    connect,
    disconnect,
    invokeScript,
    getBalance,
  };
}
