// Contract integration layer for The Verdict
import { client as readClient, createWriteClient, type EthereumProvider } from './genlayerClient';
import { chains } from 'genlayer-js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const rawAddress = import.meta.env.VITE_CONTRACT_ADDRESS;

const isConfigured =
  !!rawAddress &&
  rawAddress.startsWith('0x') &&
  rawAddress.length === 42 &&
  rawAddress !== ZERO_ADDRESS;

if (!rawAddress) {
  throw new Error('VITE_CONTRACT_ADDRESS not set in environment variables');
}
if (!rawAddress.startsWith('0x') || rawAddress.length !== 42) {
  throw new Error(`Invalid contract address format: ${rawAddress}`);
}

const NOT_CONFIGURED_ERR = 'Contract is not deployed or configured for Bradbury';

export type TransactionError = {
  name: string;
  message: string;
  cause?: any;
  rpcError?: any;
  transactionHash?: string;
  contractAddress: string;
  walletAddress: string;
  chainId: number;
  functionName: string;
  args: any[];
  value: bigint;
};

export type ContractDuelStatus = 'open' | 'active' | 'submitted' | 'judged' | 'expired';

export type ContractDuel = {
  id: number;
  creator: string;
  pro_player: string;
  con_player: string;
  has_con_player: boolean;
  pro_argument: string;
  con_argument: string;
  topic: string;
  category: string;
  status: ContractDuelStatus;
  winner: string;
  verdict_reasoning: string;
  pro_score: number;
  con_score: number;
  facts_snapshot: string;
  stake: number;
  join_deadline: number;
  submit_duration: number;
  submit_deadline: number;
  settled: boolean;
};

export type ContractDebater = {
  address: string;
  wins: number;
  losses: number;
  draws: number;
  total_score: number;
  debates_played: number;
  best_verdict_quote: string;
};

// Contract client for The Verdict
export class TheVerdictContract {
  private address: string;
  readonly isConfigured: boolean;

  constructor(address: string) {
    this.address = address;
    this.isConfigured = isConfigured;
  }

  private guardConfigured(): void {
    if (!this.isConfigured) {
      throw new Error(NOT_CONFIGURED_ERR);
    }
  }

  // Read methods using GenLayerJS read-only client
  async getDuel(duelId: number): Promise<ContractDuel> {
    this.guardConfigured();
    const result = await readClient.readContract({
      address: this.address as `0x${string}`,
      functionName: 'get_duel',
      args: [duelId],
    });
    return result as ContractDuel;
  }

  async getDuelCount(): Promise<number> {
    this.guardConfigured();
    const result = await readClient.readContract({
      address: this.address as `0x${string}`,
      functionName: 'get_duel_count',
      args: [],
    });
    return Number(result);
  }

  async getDebater(player: string): Promise<ContractDebater> {
    this.guardConfigured();
    const result = await readClient.readContract({
      address: this.address as `0x${string}`,
      functionName: 'get_debater',
      args: [player],
    });
    return result as ContractDebater;
  }

  async getLeaderboard(limit: number): Promise<ContractDebater[]> {
    this.guardConfigured();
    const result = await readClient.readContract({
      address: this.address as `0x${string}`,
      functionName: 'get_leaderboard',
      args: [limit],
    });
    return result as ContractDebater[];
  }

  async getAllDuels(): Promise<ContractDuel[]> {
    this.guardConfigured();
    const count = await this.getDuelCount();
    // Run all duel reads in parallel to avoid N sequential RPC round-trips
    const duelPromises: Promise<ContractDuel>[] = [];
    for (let i = 0; i < count; i++) {
      duelPromises.push(this.getDuel(i));
    }
    return Promise.all(duelPromises);
  }

  // Write methods using GenLayerJS write client (custom calldata encoding via MetaMask)
  // Requires the MetaMask provider to create a write-capable genlayer-js client.

  async createDuel(
    provider: EthereumProvider,
    address: string,
    topic: string,
    category: string,
    stake: number,
    joinDeadline: number,
    submitDuration: number
  ): Promise<string> {
    this.guardConfigured();
    const writeClient = createWriteClient(provider);
    const functionName = 'create_duel';
    const callArgs = [topic, category, stake, joinDeadline, submitDuration];

    try {
      const txHash = await writeClient.writeContract({
        // Pass as viem JsonRpcAccount so genlayer-js treats it as a MetaMask/external account
        // (type !== 'local' triggers the provider-based eth_sendTransaction path)
        account: { address: address as `0x${string}`, type: 'json-rpc' as const } as any,
        address: this.address as `0x${string}`,
        functionName,
        args: callArgs,
        value: BigInt(stake),
      });
      return txHash;
    } catch (error) {
      const transactionError: TransactionError = {
        name: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : String(error),
        cause: error instanceof Error ? (error as any).cause : undefined,
        rpcError: error,
        contractAddress: this.address,
        walletAddress: address,
        chainId: chains.testnetBradbury.id,
        functionName,
        args: callArgs,
        value: BigInt(stake),
      };
      console.error(`[${functionName}] Transaction failed:`, transactionError);
      throw transactionError;
    }
  }

  async joinDuel(provider: EthereumProvider, address: string, duelId: number, stake: number): Promise<string> {
    this.guardConfigured();
    const writeClient = createWriteClient(provider);
    const functionName = 'join_duel';
    const callArgs = [duelId];

    try {
      const txHash = await writeClient.writeContract({
        // Pass as viem JsonRpcAccount so genlayer-js treats it as a MetaMask/external account
        // (type !== 'local' triggers the provider-based eth_sendTransaction path)
        account: { address: address as `0x${string}`, type: 'json-rpc' as const } as any,
        address: this.address as `0x${string}`,
        functionName,
        args: callArgs,
        value: BigInt(stake),
      });
      return txHash;
    } catch (error) {
      const transactionError: TransactionError = {
        name: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : String(error),
        cause: error instanceof Error ? (error as any).cause : undefined,
        rpcError: error,
        contractAddress: this.address,
        walletAddress: address,
        chainId: chains.testnetBradbury.id,
        functionName,
        args: callArgs,
        value: BigInt(stake),
      };
      console.error(`[${functionName}] Transaction failed:`, transactionError);
      throw transactionError;
    }
  }

  async submitArgument(provider: EthereumProvider, address: string, duelId: number, argument: string): Promise<string> {
    this.guardConfigured();
    const writeClient = createWriteClient(provider);
    const functionName = 'submit_argument';
    const callArgs = [duelId, argument];

    try {
      const txHash = await writeClient.writeContract({
        // Pass as viem JsonRpcAccount so genlayer-js treats it as a MetaMask/external account
        // (type !== 'local' triggers the provider-based eth_sendTransaction path)
        account: { address: address as `0x${string}`, type: 'json-rpc' as const } as any,
        address: this.address as `0x${string}`,
        functionName,
        args: callArgs,
        value: 0n,
      });
      return txHash;
    } catch (error) {
      const transactionError: TransactionError = {
        name: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : String(error),
        cause: error instanceof Error ? (error as any).cause : undefined,
        rpcError: error,
        contractAddress: this.address,
        walletAddress: address,
        chainId: chains.testnetBradbury.id,
        functionName,
        args: callArgs,
        value: 0n,
      };
      console.error(`[${functionName}] Transaction failed:`, transactionError);
      throw transactionError;
    }
  }

  async judgeDuel(provider: EthereumProvider, address: string, duelId: number): Promise<string> {
    this.guardConfigured();
    const writeClient = createWriteClient(provider);
    const functionName = 'judge_duel';
    const callArgs = [duelId];

    try {
      const txHash = await writeClient.writeContract({
        // Pass as viem JsonRpcAccount so genlayer-js treats it as a MetaMask/external account
        // (type !== 'local' triggers the provider-based eth_sendTransaction path)
        account: { address: address as `0x${string}`, type: 'json-rpc' as const } as any,
        address: this.address as `0x${string}`,
        functionName,
        args: callArgs,
        value: 0n,
      });
      return txHash;
    } catch (error) {
      const transactionError: TransactionError = {
        name: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : String(error),
        cause: error instanceof Error ? (error as any).cause : undefined,
        rpcError: error,
        contractAddress: this.address,
        walletAddress: address,
        chainId: chains.testnetBradbury.id,
        functionName,
        args: callArgs,
        value: 0n,
      };
      console.error(`[${functionName}] Transaction failed:`, transactionError);
      throw transactionError;
    }
  }

  async expireDuel(provider: EthereumProvider, address: string, duelId: number): Promise<string> {
    this.guardConfigured();
    const writeClient = createWriteClient(provider);
    const functionName = 'expire_duel';
    const callArgs = [duelId];

    try {
      const txHash = await writeClient.writeContract({
        // Pass as viem JsonRpcAccount so genlayer-js treats it as a MetaMask/external account
        // (type !== 'local' triggers the provider-based eth_sendTransaction path)
        account: { address: address as `0x${string}`, type: 'json-rpc' as const } as any,
        address: this.address as `0x${string}`,
        functionName,
        args: callArgs,
        value: 0n,
      });
      return txHash;
    } catch (error) {
      const transactionError: TransactionError = {
        name: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : String(error),
        cause: error instanceof Error ? (error as any).cause : undefined,
        rpcError: error,
        contractAddress: this.address,
        walletAddress: address,
        chainId: chains.testnetBradbury.id,
        functionName,
        args: callArgs,
        value: 0n,
      };
      console.error(`[${functionName}] Transaction failed:`, transactionError);
      throw transactionError;
    }
  }

  // Transaction status polling using GenLayerJS native status handling
  async getTransactionStatus(txHash: string): Promise<{ status: 'pending' | 'confirmed' | 'failed'; result?: any }> {
    try {
      const receipt = await readClient.waitForTransactionReceipt({ 
        hash: txHash as any,
      });
      
      if (receipt) {
        return { status: 'confirmed', result: receipt };
      }
      
      return { status: 'pending' };
    } catch (error) {
      console.error('Error fetching transaction status:', error);
      return { status: 'pending' };
    }
  }
}

// Contract constants
export const CONTRACT_CONSTANTS = {
  MIN_ARGUMENT_LENGTH: 50,
  MAX_ARGUMENT_LENGTH: 800,
  MIN_TOPIC_LENGTH: 20,
  MAX_TOPIC_LENGTH: 180,
  MAX_CATEGORY_LENGTH: 48,
  JOIN_DEADLINE_SECONDS: 86400,
  SUBMIT_DURATION_SECONDS: 172800,
  MIN_STAKE: 0,
} as const;

// Export singleton instance
export const contract = new TheVerdictContract(rawAddress);
export { isConfigured as contractIsConfigured };
