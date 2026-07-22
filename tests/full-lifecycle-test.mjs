// Full lifecycle test with two wallets
import { createClient, createAccount, chains } from 'genlayer-js';
import dotenv from 'dotenv';

dotenv.config();

const CONTRACT_ADDRESS = process.env.VITE_CONTRACT_ADDRESS;
const PRIVATE_KEY_A = process.env.VITE_GENLAYER_PRIVATE_KEY;
const PRIVATE_KEY_B = process.env.VITE_GENLAYER_PRIVATE_KEY_B;

if (!CONTRACT_ADDRESS || !PRIVATE_KEY_A || !PRIVATE_KEY_B) {
  console.error('Missing environment variables. Check .env file.');
  process.exit(1);
}

// Initialize GenLayerJS client for Bradbury Testnet
const client = createClient({
  chain: chains.testnetBradbury,
});

// Create accounts
const accountA = createAccount(PRIVATE_KEY_A);
const accountB = createAccount(PRIVATE_KEY_B);

console.log('=== Full Lifecycle Test ===');
console.log('Wallet A address:', accountA.address);
console.log('Wallet B address:', accountB.address);
console.log('Contract address:', CONTRACT_ADDRESS);
console.log('');

// Helper function to wait for transaction receipt via explicit polling with detailed logging
async function waitForTransaction(txHash, description) {
  console.log(`Waiting for ${description}...`);
  console.log(`Transaction hash: ${txHash}`);
  console.log(`Phase 1: Submission succeeded, tx hash exists`);
  console.log('');
  
  const maxAttempts = 24; // 2 minutes with 5-second intervals
  let debugCounter = 0;
  let stallCounter = 0;
  let previousState = null;
  
  for (let i = 0; i < maxAttempts; i++) {
    const tx = await client.getTransaction({ hash: txHash });
    
    // Create state tuple for stall detection
    const currentState = {
      statusName: tx.statusName,
      resultName: tx.resultName,
      txExecutionResultName: tx.txExecutionResultName,
      queuePosition: tx.queuePosition || tx.queue_position || 'N/A',
      txExecutionHash: tx.txExecutionHash,
    };
    
    // Check for stall (unchanged state for 6 consecutive attempts)
    if (previousState && 
        currentState.statusName === previousState.statusName &&
        currentState.resultName === previousState.resultName &&
        currentState.txExecutionResultName === previousState.txExecutionResultName &&
        currentState.queuePosition === previousState.queuePosition &&
        currentState.txExecutionHash === previousState.txExecutionHash) {
      stallCounter++;
    } else {
      stallCounter = 0;
    }
    
    previousState = currentState;
    
    // Log detailed transaction state
    console.log(`Attempt ${i + 1}/${maxAttempts}:`);
    console.log(`  status=${tx.status}, statusName=${tx.statusName}`);
    console.log(`  result=${tx.result}, resultName=${tx.resultName}`);
    console.log(`  txExecutionResult=${tx.txExecutionResult}, txExecutionResultName=${tx.txExecutionResultName}`);
    console.log(`  queuePosition=${currentState.queuePosition}`);
    console.log(`  txExecutionHash=${tx.txExecutionHash}`);
    
    // Distinguish phases
    if (tx.statusName === 'PENDING') {
      console.log(`  Phase 2: Consensus status PENDING`);
    } else if (tx.statusName === 'ACCEPTED' || tx.statusName === 'FINALIZED') {
      console.log(`  Phase 3: Execution reached ${tx.statusName}`);
      console.log(`${description} completed`);
      console.log(`Final status: ${tx.statusName} (${tx.status})`);
      console.log('');
      return tx;
    } else if (tx.statusName === 'FAILED') {
      console.log(`  Phase 3: Execution FAILED`);
      throw new Error(`Transaction failed: ${tx.statusName}`);
    }
    
    // Early stall detection
    if (stallCounter >= 6) {
      console.log(`Stall detected: no state change after 6 consecutive polls`);
      
      const stallSummary = {
        txHash,
        status: tx.status,
        statusName: tx.statusName,
        result: tx.result,
        resultName: tx.resultName,
        txExecutionResult: tx.txExecutionResult,
        txExecutionResultName: tx.txExecutionResultName,
        queuePosition: currentState.queuePosition,
        txExecutionHash: tx.txExecutionHash,
        createdTimestamp: tx.createdTimestamp,
        currentTimestamp: tx.currentTimestamp,
        validUntil: tx.validUntil || 'N/A',
      };
      
      console.log(`Final compact summary:`);
      console.log(JSON.stringify(stallSummary, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value, 2));
      
      throw new Error(`Transaction appears stalled in PENDING: no state change after 6 consecutive polls`);
    }
    
    // Full dump on attempt 1 and every 6 attempts after
    debugCounter++;
    if (debugCounter === 1 || debugCounter % 6 === 0) {
      console.log(`--- Full transaction dump ---`);
      console.log(JSON.stringify(tx, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value, 2));
      console.log(`--- End dump ---`);
    }
    
    console.log('');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  // Timeout - report final state
  console.log(`Timeout after ${maxAttempts} attempts`);
  const finalTx = await client.getTransaction({ hash: txHash });
  console.log(`Final transaction state:`);
  console.log(JSON.stringify(finalTx, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value, 2));
  
  throw new Error(`Transaction did not reach ACCEPTED/FINALIZED status after ${maxAttempts} attempts`);
}

// Helper function to get wallet balance
async function getBalance(address) {
  const balance = await client.getBalance({ address });
  console.log(`Balance for ${address}: ${balance} GEN`);
  return balance;
}

// Step 1: Wallet A creates a duel
async function step1_createDuel() {
  console.log('=== Step 1: Wallet A creates duel ===');
  
  const topic = "Ethereum will flip Bitcoin's market cap by 2028";
  const category = 'Market predictions';
  const joinDuration = 86400; // 1 day in seconds
  const submitDuration = 172800; // 2 days in seconds
  
  const txHash = await client.writeContract({
    account: accountA,
    address: CONTRACT_ADDRESS,
    functionName: 'create_duel',
    args: [topic, category, joinDuration, submitDuration],
    value: 1000000n, // 1 GEN stake
  });
  
  const receipt = await waitForTransaction(txHash, 'create_duel');
  
  // Get the duel ID from the transaction receipt or by querying the contract
  const duelCount = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: 'get_duel_count',
    args: [],
  });
  
  const duelId = Number(duelCount) - 1;
  console.log(`Created duel ID: ${duelId}`);
  console.log('');
  
  return duelId;
}

// Step 2: Wallet B joins the duel
async function step2_joinDuel(duelId) {
  console.log('=== Step 2: Wallet B joins duel ===');
  console.log(`Duel ID: ${duelId}`);
  
  const txHash = await client.writeContract({
    account: accountB,
    address: CONTRACT_ADDRESS,
    functionName: 'join_duel',
    args: [duelId],
    value: 1000000n, // 1 GEN stake
  });
  
  await waitForTransaction(txHash, 'join_duel');
  console.log('');
}

// Step 3: Both wallets submit arguments
async function step3_submitArguments(duelId) {
  console.log('=== Step 3: Both wallets submit arguments ===');
  console.log(`Duel ID: ${duelId}`);
  
  // Wallet A (pro) submits argument
  const proArgument = "Ethereum's superior smart contract capabilities, DeFi ecosystem, and institutional adoption will drive it to surpass Bitcoin's market cap by 2028.";
  const txHashA = await client.writeContract({
    account: accountA,
    address: CONTRACT_ADDRESS,
    functionName: 'submit_argument',
    args: [duelId, proArgument],
    value: 0n,
  });
  
  await waitForTransaction(txHashA, 'submit_argument (Wallet A - Pro)');
  
  // Wallet B (con) submits argument
  const conArgument = "Bitcoin's monetary premium, first-mover advantage, and institutional reserve status make it unlikely to be surpassed by Ethereum in the near term.";
  const txHashB = await client.writeContract({
    account: accountB,
    address: CONTRACT_ADDRESS,
    functionName: 'submit_argument',
    args: [duelId, conArgument],
    value: 0n,
  });
  
  await waitForTransaction(txHashB, 'submit_argument (Wallet B - Con)');
  console.log('');
}

// Step 4: Trigger judgment
async function step4_triggerJudgment(duelId) {
  console.log('=== Step 4: Trigger judgment ===');
  console.log(`Duel ID: ${duelId}`);
  
  const txHash = await client.writeContract({
    account: accountA,
    address: CONTRACT_ADDRESS,
    functionName: 'judge_duel',
    args: [duelId],
    value: 0n,
  });
  
  await waitForTransaction(txHash, 'judge_duel');
  console.log('');
}

// Step 5: Poll until judged
async function step5_pollUntilJudged(duelId) {
  console.log('=== Step 5: Poll until duel is judged ===');
  console.log(`Duel ID: ${duelId}`);
  
  for (let i = 0; i < 60; i++) {
    const duel = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_duel',
      args: [duelId],
    });
    
    console.log(`Attempt ${i + 1}/60: Status = ${duel.status}`);
    
    if (duel.status === 'judged') {
      console.log('Duel has been judged');
      console.log('Winner:', duel.winner);
      console.log('Verdict reasoning:', duel.verdict_reasoning);
      console.log('Winning quote:', duel.winning_quote);
      console.log('Pro score:', duel.pro_score);
      console.log('Con score:', duel.con_score);
      console.log('');
      return duel;
    }
    
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
  }
  
  throw new Error('Duel did not reach judged status after 60 attempts');
}

// Step 6: Verify payout
async function step6_verifyPayout(winnerAddress) {
  console.log('=== Step 6: Verify payout to winner ===');
  console.log(`Expected winner: ${winnerAddress}`);
  
  const balance = await getBalance(winnerAddress);
  console.log(`Winner's final balance: ${balance} GEN`);
  console.log('');
  
  return balance;
}

// Main test execution - Step 1 only (create_duel isolation test)
async function runFullLifecycleTest() {
  try {
    // Get initial balances
    console.log('=== Initial Balances ===');
    const balanceA = await getBalance(accountA.address);
    const balanceB = await getBalance(accountB.address);
    console.log('');
    
    // Execute only Step 1: create_duel
    console.log('=== Running Step 1 Only (create_duel isolation test) ===');
    const duelId = await step1_createDuel();
    
    console.log('=== Step 1 Completed ===');
    console.log(`Created duel ID: ${duelId}`);
    console.log('Test stopped after Step 1 as requested');
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

runFullLifecycleTest();
