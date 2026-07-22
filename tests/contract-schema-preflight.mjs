// Contract schema inspection and preflight test
import { createClient, createAccount, chains } from 'genlayer-js';
import dotenv from 'dotenv';

dotenv.config();

const CONTRACT_ADDRESS = process.env.VITE_CONTRACT_ADDRESS;
const PRIVATE_KEY_A = process.env.VITE_GENLAYER_PRIVATE_KEY;

if (!CONTRACT_ADDRESS || !PRIVATE_KEY_A) {
  console.error('Missing environment variables. Check .env file.');
  process.exit(1);
}

// Initialize GenLayerJS client for Bradbury Testnet
const client = createClient({
  chain: chains.testnetBradbury,
});

// Create account
const accountA = createAccount(PRIVATE_KEY_A);

console.log('=== Contract Schema Inspection ===');
console.log('Contract address:', CONTRACT_ADDRESS);
console.log('Wallet address:', accountA.address);
console.log('');

// Retry logic for transient transport failures
async function withRetry(fn, description) {
  const maxRetries = 3;
  const delays = [2000, 5000, 10000]; // exponential backoff
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const errorMsg = error.message || error.toString();
      const isTransient = errorMsg.includes('transient rpc error') ||
                          errorMsg.includes('circuit breaker') ||
                          errorMsg.includes('transport') ||
                          errorMsg.includes('fetching');
      
      if (isTransient && attempt < maxRetries - 1) {
        console.log(`${description} failed with transient error, retry ${attempt + 1}/${maxRetries} after ${delays[attempt]}ms...`);
        await new Promise(resolve => setTimeout(resolve, delays[attempt]));
      } else if (isTransient) {
        console.error(`${description} failed after ${maxRetries} retries: ${errorMsg}`);
        throw new Error(`RPC transport failure: ${errorMsg}`);
      } else {
        // Not a transient error, don't retry
        console.error(`${description} failed with non-transient error: ${errorMsg}`);
        throw error;
      }
    }
  }
}

// Step 1: Connectivity check
async function checkConnectivity() {
  console.log('Step 1: Connectivity check...');
  try {
    // Test basic RPC connectivity with balance read
    const balance = await withRetry(() => 
      client.getBalance({ address: accountA.address }), 
      'Balance read'
    );
    console.log(`Connectivity check: PASS`);
    console.log(`Wallet balance: ${balance}`);
    console.log('');
    return { success: true, balance };
  } catch (error) {
    console.log(`Connectivity check: FAIL`);
    console.log(`Error: ${error.message}`);
    console.log('');
    return { success: false, error };
  }
}

// Step 2: Minimal valid contract read set
async function checkContractReadPath() {
  console.log('Step 2: Contract read path check...');
  try {
    // Read duel count
    const duelCount = await withRetry(() =>
      client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_duel_count',
        args: [],
      }),
      'get_duel_count'
    );
    console.log(`get_duel_count: ${duelCount}`);
    
    // If duels exist, read one
    if (duelCount > 0) {
      const duel = await withRetry(() =>
        client.readContract({
          address: CONTRACT_ADDRESS,
          functionName: 'get_duel',
          args: [0],
        }),
        'get_duel'
      );
      console.log(`get_duel(0): exists`);
    }
    
    // Read debater for current wallet
    const debater = await withRetry(() =>
      client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_debater',
        args: [accountA.address],
      }),
      'get_debater'
    );
    console.log(`get_debater(wallet): exists`);
    
    console.log(`Contract read path: PASS`);
    console.log('');
    return { success: true, duelCount };
  } catch (error) {
    const errorMsg = error.message || error.toString();
    if (errorMsg.includes('RPC transport failure')) {
      console.log(`Contract read path: INCONCLUSIVE`);
      console.log(`Root cause: RPC transport failure`);
    } else {
      console.log(`Contract read path: FAIL`);
      console.log(`Root cause: Contract call failure`);
    }
    console.log(`Error: ${errorMsg}`);
    console.log('');
    return { success: false, error, cause: errorMsg.includes('RPC transport failure') ? 'transport' : 'contract' };
  }
}

// Main execution
async function runPreflight() {
  try {
    // Step 1: Connectivity check
    const connectivity = await checkConnectivity();
    
    if (!connectivity.success) {
      console.log('=== Preflight Results ===');
      console.log('Connectivity check: FAIL');
      console.log('Balance read: FAIL');
      console.log('Contract read path: INCONCLUSIVE');
      console.log('Root cause classification: RPC transport');
      console.log('');
      console.log('RPC unhealthy - contract reads inconclusive');
      console.log('Write-call diagnosis must be postponed until Bradbury RPC stabilizes');
      process.exit(1);
    }
    
    console.log('Balance read: PASS');
    
    // Step 2: Contract read path
    const contractRead = await checkContractReadPath();
    
    console.log('=== Preflight Results ===');
    console.log('Connectivity check: PASS');
    console.log('Balance read: PASS');
    
    if (contractRead.success) {
      console.log('Contract read path: PASS');
      console.log('Root cause classification: None - RPC healthy');
      console.log('');
      console.log('RPC healthy - write-call diagnosis can proceed');
    } else if (contractRead.cause === 'transport') {
      console.log('Contract read path: INCONCLUSIVE');
      console.log('Root cause classification: RPC transport');
      console.log('');
      console.log('RPC unhealthy - contract reads inconclusive');
      console.log('Write-call diagnosis must be postponed until Bradbury RPC stabilizes');
      process.exit(1);
    } else {
      console.log('Contract read path: FAIL');
      console.log('Root cause classification: Contract call');
      console.log('');
      console.log('RPC healthy but contract calls failing - investigate contract interface');
    }
    
  } catch (error) {
    console.error('Preflight failed:', error);
    process.exit(1);
  }
}

runPreflight();
