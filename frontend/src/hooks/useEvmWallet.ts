import { useState, useEffect, useCallback } from 'react';
import { BrowserProvider, JsonRpcSigner, Contract, formatUnits } from 'ethers';
import { config } from '../config';
import type { WalletState } from '../types';

// Minimal ERC20 ABI for balance checking
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, callback: (...args: unknown[]) => void) => void;
      removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
    };
  }
}

export function useEvmWallet() {
  const [state, setState] = useState<WalletState>({
    connected: false,
    address: null,
    chainId: null,
  });
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if MetaMask is installed
  const isMetaMaskInstalled = typeof window !== 'undefined' && !!window.ethereum?.isMetaMask;

  // Connect wallet
  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError('Please install MetaMask');
      return;
    }

    try {
      setError(null);

      // Request accounts
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      }) as string[];

      // Get chain ID
      const chainIdHex = await window.ethereum.request({
        method: 'eth_chainId',
      }) as string;
      const chainId = parseInt(chainIdHex, 16);

      // Create provider and signer
      const browserProvider = new BrowserProvider(window.ethereum);
      const walletSigner = await browserProvider.getSigner();

      setProvider(browserProvider);
      setSigner(walletSigner);
      setState({
        connected: true,
        address: accounts[0],
        chainId,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to connect wallet';
      setError(message);
    }
  }, []);

  // Disconnect wallet
  const disconnect = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setState({
      connected: false,
      address: null,
      chainId: null,
    });
  }, []);

  // Switch to Unit0 network
  const switchToUnit0 = useCallback(async () => {
    if (!window.ethereum) return;

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: config.unit0.chainIdHex }],
      });
    } catch (switchError: unknown) {
      // Chain not added, add it
      if ((switchError as { code?: number })?.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: config.unit0.chainIdHex,
                chainName: config.unit0.name,
                rpcUrls: [config.unit0.rpcUrl],
                nativeCurrency: config.unit0.nativeCurrency,
                blockExplorerUrls: [config.unit0.explorer],
              },
            ],
          });
        } catch (addError) {
          console.error('Failed to add network:', addError);
        }
      }
    }
  }, []);

  // Listen for account changes
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts: unknown) => {
      const accountList = accounts as string[];
      if (accountList.length === 0) {
        disconnect();
      } else if (state.connected) {
        setState((prev) => ({ ...prev, address: accountList[0] }));
      }
    };

    const handleChainChanged = (chainId: unknown) => {
      setState((prev) => ({ ...prev, chainId: parseInt(chainId as string, 16) }));
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum?.removeListener('chainChanged', handleChainChanged);
    };
  }, [state.connected, disconnect]);

  // Check if already connected on mount
  useEffect(() => {
    const checkConnection = async () => {
      if (!window.ethereum) return;

      try {
        const accounts = await window.ethereum.request({
          method: 'eth_accounts',
        }) as string[];

        if (accounts.length > 0) {
          const chainIdHex = await window.ethereum.request({
            method: 'eth_chainId',
          }) as string;

          const browserProvider = new BrowserProvider(window.ethereum);
          const walletSigner = await browserProvider.getSigner();

          setProvider(browserProvider);
          setSigner(walletSigner);
          setState({
            connected: true,
            address: accounts[0],
            chainId: parseInt(chainIdHex, 16),
          });
        }
      } catch (err) {
        console.error('Failed to check connection:', err);
      }
    };

    checkConnection();
  }, []);

  // Get ERC20 token balance
  const getTokenBalance = useCallback(
    async (tokenAddress: string, decimals: number = 18): Promise<string> => {
      if (!provider || !state.address) return '0';

      try {
        const contract = new Contract(tokenAddress, ERC20_ABI, provider);
        const balance = await contract.balanceOf(state.address);
        return formatUnits(balance, decimals);
      } catch (err) {
        console.error('Failed to get token balance:', err);
        return '0';
      }
    },
    [provider, state.address]
  );

  return {
    ...state,
    provider,
    signer,
    error,
    isMetaMaskInstalled,
    connect,
    disconnect,
    switchToUnit0,
    isOnUnit0: state.chainId === config.unit0.chainId,
    getTokenBalance,
  };
}
