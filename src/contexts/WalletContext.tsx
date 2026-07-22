import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { chains } from 'genlayer-js';
import { createWalletClient, custom, type WalletClient } from 'viem';
import { createWriteClient, type EthereumProvider } from '../lib/genlayerClient';

interface WalletContextType {
  address: string | null;
  isConnected: boolean;
  chainId: string | null;
  error: string | null;
  wrongNetwork: boolean;
  walletClient: WalletClient | null;
  provider: EthereumProvider | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToBradbury: () => Promise<void>;
  getAccount: () => { walletClient: WalletClient; address: string } | null;
  /** Returns a genlayer-js client for write operations (uses GenLayer custom calldata encoding via MetaMask) */
  getGenlayerClient: () => ReturnType<typeof createWriteClient> | null;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const EXPECTED_CHAIN_ID = chains.testnetBradbury.id.toString();

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wrongNetwork, setWrongNetwork] = useState(false);
  const [provider, setProvider] = useState<EthereumProvider | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [genlayerClient, setGenlayerClient] = useState<ReturnType<typeof createWriteClient> | null>(null);

  const checkNetwork = useCallback((currentChainId: string) => {
    if (!EXPECTED_CHAIN_ID) {
      console.warn('Expected chain ID not set, skipping network check');
      return false;
    }
    const expectedHex = `0x${parseInt(EXPECTED_CHAIN_ID).toString(16)}`;
    const isWrong = currentChainId !== expectedHex && currentChainId !== EXPECTED_CHAIN_ID;
    setWrongNetwork(isWrong);
    return isWrong;
  }, []);

  // Check for injected wallet on mount
  useEffect(() => {
    const checkForWallet = () => {
      if (typeof window === 'undefined') return;
      const ethereum = (window as any).ethereum as EthereumProvider | undefined;
      if (ethereum) {
        setProvider(ethereum);
        ethereum.request({ method: 'eth_accounts' })
          .then((result: unknown) => {
            const accounts = result as string[];
            if (accounts.length > 0) {
              const account = accounts[0] as `0x${string}`;
              setAddress(account);
              ethereum.request({ method: 'eth_chainId' })
                .then((chainIdResult: unknown) => {
                  const chainId = chainIdResult as string;
                  setChainId(chainId);
                  checkNetwork(chainId);

                  const client = createWalletClient({
                    account,
                    chain: chains.testnetBradbury,
                    transport: custom(ethereum),
                  });
                  setWalletClient(client);
                  setGenlayerClient(createWriteClient(ethereum));
                })
                .catch(() => setChainId(null));
            }
          })
          .catch(() => {
            // Not connected, that's fine
          });
      } else {
        setError('No wallet extension found. Please install MetaMask or another compatible wallet.');
      }
    };

    checkForWallet();
  }, [checkNetwork]);

  // Listen for account changes
  useEffect(() => {
    if (!provider) return;

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (accounts.length === 0) {
        setAddress(null);
        setChainId(null);
        setWrongNetwork(false);
      } else {
        setAddress(accounts[0]);
      }
    };

    const handleChainChanged = (...args: unknown[]) => {
      const chainId = args[0] as string;
      setChainId(chainId);
      checkNetwork(chainId);
    };

    const handleDisconnect = () => {
      setAddress(null);
      setChainId(null);
      setWrongNetwork(false);
    };

    provider.on?.('accountsChanged', handleAccountsChanged);
    provider.on?.('chainChanged', handleChainChanged);
    provider.on?.('disconnect', handleDisconnect);

    return () => {
      provider.removeListener?.('accountsChanged', handleAccountsChanged);
      provider.removeListener?.('chainChanged', handleChainChanged);
      provider.removeListener?.('disconnect', handleDisconnect);
    };
  }, [provider, checkNetwork]);

  const connect = useCallback(async () => {
    if (!provider) {
      setError('No wallet extension found. Please install MetaMask or another compatible wallet.');
      return;
    }

    try {
      setError(null);
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
      if (accounts.length > 0) {
        const account = accounts[0] as `0x${string}`;
        setAddress(account);
        const chainId = await provider.request({ method: 'eth_chainId' }) as string;
        setChainId(chainId);
        checkNetwork(chainId);

        // Create both viem wallet client and genlayer-js write client
        const client = createWalletClient({
          account,
          chain: chains.testnetBradbury,
          transport: custom(provider),
        });
        setWalletClient(client);
        setGenlayerClient(createWriteClient(provider));
      }
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('User rejected')) {
          setError('Connection rejected by user.');
        } else {
          setError(`Failed to connect: ${err.message}`);
        }
      } else {
        setError('Failed to connect wallet.');
      }
    }
  }, [provider, checkNetwork]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
    setError(null);
    setWrongNetwork(false);
    setWalletClient(null);
    setGenlayerClient(null);
  }, []);

  const switchToBradbury = useCallback(async () => {
    if (!provider) {
      setError('No wallet extension found.');
      return;
    }

    try {
      setError(null);
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${parseInt(EXPECTED_CHAIN_ID).toString(16)}` }],
      });
      const newChainId = await provider.request({ method: 'eth_chainId' }) as string;
      setChainId(newChainId);
      checkNetwork(newChainId);
    } catch (switchError: any) {
      if (switchError?.code === 4902) {
        try {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${parseInt(EXPECTED_CHAIN_ID).toString(16)}`,
              chainName: 'GenLayer Bradbury Testnet',
              nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
              rpcUrls: ['https://rpc-bradbury.genlayer.com'],
              blockExplorerUrls: ['https://explorer-bradbury.genlayer.com'],
            }],
          });
          const newChainId = await provider.request({ method: 'eth_chainId' }) as string;
          setChainId(newChainId);
          checkNetwork(newChainId);
        } catch (addError) {
          if (addError instanceof Error) {
            if (addError.message.includes('User rejected')) {
              setError('Network switch rejected by user.');
            } else {
              setError('Failed to add Bradbury network.');
            }
          }
        }
      } else if (switchError?.message?.includes('User rejected')) {
        setError('Network switch rejected by user.');
      } else {
        console.error('Failed to switch network:', switchError);
        setError('Failed to switch to Bradbury network.');
      }
    }
  }, [provider, checkNetwork]);

  const getAccount = useCallback(() => {
    if (!walletClient || !address) {
      return null;
    }
    return { walletClient, address };
  }, [walletClient, address]);

  const getGenlayerClient = useCallback(() => {
    return genlayerClient;
  }, [genlayerClient]);

  const value = {
    address,
    isConnected: !!address,
    chainId,
    error,
    wrongNetwork,
    walletClient,
    provider,
    connect,
    disconnect,
    switchToBradbury,
    getAccount,
    getGenlayerClient,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
