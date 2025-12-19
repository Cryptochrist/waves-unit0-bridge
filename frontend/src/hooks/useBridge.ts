import { useState, useCallback } from 'react';
import { ethers, Contract } from 'ethers';
import { config, BRIDGE_ABI, ERC20_ABI } from '../config';
import type { Token, Transfer, BridgeStats } from '../types';

interface UseBridgeProps {
  evmSigner: ethers.Signer | null;
  wavesInvokeScript: (params: {
    dApp: string;
    call: { function: string; args: Array<{ type: string; value: unknown }> };
    payment?: Array<{ assetId: string | null; amount: number }>;
  }) => Promise<unknown>;
  evmAddress: string | null;
  wavesAddress: string | null;
}

export function useBridge({ evmSigner, wavesInvokeScript, evmAddress, wavesAddress }: UseBridgeProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingTransfers, setPendingTransfers] = useState<Transfer[]>([]);

  // Lock tokens on Unit0 (Unit0 -> WAVES)
  const lockOnUnit0 = useCallback(
    async (token: Token, amount: string, wavesRecipient: string): Promise<string | null> => {
      if (!evmSigner) {
        setError('EVM wallet not connected');
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const bridge = new Contract(config.unit0Bridge, BRIDGE_ABI, evmSigner);
        const tokenContract = new Contract(token.address, ERC20_ABI, evmSigner);

        // Parse amount with decimals
        const amountBigInt = ethers.parseUnits(amount, token.decimals);

        // Check allowance
        const signerAddress = await evmSigner.getAddress();
        const allowance = await tokenContract.allowance(signerAddress, config.unit0Bridge);

        // Approve if needed
        if (allowance < amountBigInt) {
          console.log('Approving tokens...');
          const approveTx = await tokenContract.approve(config.unit0Bridge, amountBigInt);
          await approveTx.wait();
          console.log('Tokens approved');
        }

        // Lock tokens
        console.log('Locking tokens...');
        const lockTx = await bridge.lockERC20(token.address, amountBigInt, wavesRecipient);
        const receipt = await lockTx.wait();

        console.log('Tokens locked:', receipt.hash);
        return receipt.hash;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to lock tokens';
        setError(message);
        console.error('Lock error:', err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [evmSigner]
  );

  // Lock tokens on WAVES (WAVES -> Unit0)
  const lockOnWaves = useCallback(
    async (assetId: string, amount: number, unit0Recipient: string): Promise<string | null> => {
      if (!wavesAddress) {
        setError('WAVES wallet not connected');
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await wavesInvokeScript({
          dApp: config.wavesBridge,
          call: {
            function: 'lockTokens',
            args: [
              { type: 'string', value: unit0Recipient },
              { type: 'integer', value: config.unit0.chainId },
            ],
          },
          payment: [{ assetId: assetId === 'WAVES' ? null : assetId, amount }],
        });

        console.log('Tokens locked on WAVES:', result);
        return (result as { id: string }).id;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to lock tokens on WAVES';
        setError(message);
        console.error('Lock error:', err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [wavesAddress, wavesInvokeScript]
  );

  // Get token balance on Unit0
  const getUnit0Balance = useCallback(
    async (tokenAddress: string): Promise<string> => {
      if (!evmSigner || !evmAddress) return '0';

      try {
        const tokenContract = new Contract(tokenAddress, ERC20_ABI, evmSigner);
        const balance = await tokenContract.balanceOf(evmAddress);
        const decimals = await tokenContract.decimals();
        return ethers.formatUnits(balance, decimals);
      } catch (err) {
        console.error('Failed to get balance:', err);
        return '0';
      }
    },
    [evmSigner, evmAddress]
  );

  // Get bridge stats from validator API
  const getBridgeStats = useCallback(async (): Promise<BridgeStats | null> => {
    try {
      const response = await fetch(`${config.validatorApi}/stats`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    } catch (err) {
      console.error('Failed to get bridge stats:', err);
      return null;
    }
  }, []);

  // Get pending transfers from validator API
  const fetchPendingTransfers = useCallback(async () => {
    try {
      const response = await fetch(`${config.validatorApi}/transfers/pending`);
      if (!response.ok) throw new Error('Failed to fetch transfers');
      const transfers = await response.json();
      setPendingTransfers(transfers);
      return transfers;
    } catch (err) {
      console.error('Failed to get pending transfers:', err);
      return [];
    }
  }, []);

  // Get transfer by ID
  const getTransfer = useCallback(async (transferId: string): Promise<Transfer | null> => {
    try {
      const response = await fetch(`${config.validatorApi}/transfers/${transferId}`);
      if (!response.ok) return null;
      return response.json();
    } catch (err) {
      console.error('Failed to get transfer:', err);
      return null;
    }
  }, []);

  // Check if token is already registered on Unit0
  const isTokenRegisteredOnUnit0 = useCallback(
    async (wavesAssetId: string): Promise<string | null> => {
      if (!evmSigner) return null;

      try {
        const bridge = new Contract(config.unit0Bridge, BRIDGE_ABI, evmSigner);
        const tokenAddress = await bridge.wavesToUnit0Token(wavesAssetId);
        if (tokenAddress === '0x0000000000000000000000000000000000000000') {
          return null;
        }
        return tokenAddress;
      } catch (err) {
        console.error('Failed to check token registration:', err);
        return null;
      }
    },
    [evmSigner]
  );

  // Register token on Unit0 (permissionless)
  const registerTokenOnUnit0 = useCallback(
    async (
      wavesAssetId: string,
      name: string,
      symbol: string,
      wavesDecimals: number,
      unit0Decimals: number
    ): Promise<{ unit0Token: string } | null> => {
      if (!evmSigner) {
        setError('EVM wallet not connected');
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const bridge = new Contract(config.unit0Bridge, BRIDGE_ABI, evmSigner);

        // Check if already registered
        const existingToken = await bridge.wavesToUnit0Token(wavesAssetId);
        if (existingToken !== '0x0000000000000000000000000000000000000000') {
          console.log('Token already registered on Unit0:', existingToken);
          return { unit0Token: existingToken };
        }

        console.log('Registering token on Unit0...');
        const tx = await bridge.registerToken(
          wavesAssetId,
          name,
          symbol,
          wavesDecimals,
          unit0Decimals
        );

        console.log('Transaction sent:', tx.hash);
        await tx.wait();

        // Get the created token address
        const unit0Token = await bridge.wavesToUnit0Token(wavesAssetId);
        console.log('Token registered on Unit0:', unit0Token);

        return { unit0Token };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to register token on Unit0';
        setError(message);
        console.error('Registration error:', err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [evmSigner]
  );

  // Register token on WAVES (permissionless)
  const registerTokenOnWaves = useCallback(
    async (
      wavesAssetId: string,
      unit0Address: string,
      decimals: number,
      name: string,
      symbol: string
    ): Promise<string | null> => {
      if (!wavesAddress) {
        setError('WAVES wallet not connected');
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await wavesInvokeScript({
          dApp: config.wavesBridge,
          call: {
            function: 'registerTokenPermissionless',
            args: [
              { type: 'string', value: wavesAssetId },
              { type: 'string', value: unit0Address },
              { type: 'integer', value: decimals },
              { type: 'string', value: name },
              { type: 'string', value: symbol },
            ],
          },
        });

        console.log('Token registered on WAVES:', result);
        return (result as { id: string }).id;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to register token on WAVES';
        // Don't set error if already registered
        if (!message.includes('already registered')) {
          setError(message);
        }
        console.error('Registration error:', err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [wavesAddress, wavesInvokeScript]
  );

  return {
    loading,
    error,
    pendingTransfers,
    lockOnUnit0,
    lockOnWaves,
    getUnit0Balance,
    getBridgeStats,
    fetchPendingTransfers,
    getTransfer,
    isTokenRegisteredOnUnit0,
    registerTokenOnUnit0,
    registerTokenOnWaves,
    clearError: () => setError(null),
  };
}
