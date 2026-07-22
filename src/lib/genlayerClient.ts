import { createClient, chains } from 'genlayer-js';

// Type for the ethereum provider injected by MetaMask
export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  providers?: EthereumProvider[];
};

// Read-only client (no wallet) - direct RPC
export const client = createClient({
  chain: chains.testnetBradbury,
});

// Creates a write-capable client using MetaMask as the provider.
// genlayer-js handles GenLayer's custom calldata encoding and routes
// through the consensus main contract. For methods like eth_sendTransaction
// it delegates to the MetaMask provider for wallet confirmation.
export function createWriteClient(provider: EthereumProvider) {
  return createClient({
    chain: chains.testnetBradbury,
    provider,
  });
}
