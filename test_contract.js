import { createClient, createAccount } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';
import { privateKeyToAccount } from 'viem/accounts';

const contractAddress = '0xa0fdC6c8e27C628a6C11cDE5F8c1F055aC3488C4';

// Create account from private key in .env using viem directly
const privateKey = '0x82066bc645af42de57298c3208907828508efd97e452804fca3d7f884a33cb02';
const account = privateKeyToAccount(privateKey);

const client = createClient({
  chain: testnetBradbury,
  account,
});

async function testContract() {
  console.log('Testing contract write path...');
  console.log('Contract address:', contractAddress);
  console.log('Account address:', account.address);

  const now = Math.floor(Date.now() / 1000);
  const joinDeadline = now + 86400; // 24 hours from now
  const submitDuration = 172800; // 48 hours
  const stake = 1000000000; // 1 GEN in wei (assuming 18 decimals)

  try {
    console.log('\n1. Calling create_duel...');
    const txHash = await client.writeContract({
      address: contractAddress,
      functionName: 'create_duel',
      args: [
        'Ethereum will flip Bitcoin market cap by 2028',
        'Crypto',
        BigInt(stake),
        BigInt(joinDeadline),
        BigInt(submitDuration)
      ],
      value: BigInt(stake),
    });

    console.log('Transaction hash:', txHash);

    console.log('\n2. Waiting for transaction receipt...');
    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      status: 'ACCEPTED',
    });

    console.log('Transaction receipt:', receipt);
    console.log('Execution result:', receipt.txExecutionResultName);

    if (receipt.txExecutionResultName === 'FINISHED_WITH_RETURN') {
      console.log('\n3. Calling get_duel_count...');
      const duelCount = await client.readContract({
        address: contractAddress,
        functionName: 'get_duel_count',
        args: [],
      });
      console.log('Duel count:', duelCount);

      console.log('\n4. Calling get_duel with id 0...');
      const duel = await client.readContract({
        address: contractAddress,
        functionName: 'get_duel',
        args: [0],
      });
      console.log('Duel data:', duel);

      console.log('\n5. Calling get_leaderboard to verify player_list/known_players...');
      const leaderboard = await client.readContract({
        address: contractAddress,
        functionName: 'get_leaderboard',
        args: [10], // limit
      });
      console.log('Leaderboard:', leaderboard);

      console.log('\n✅ Write path test PASSED');
    } else {
      console.log('\n❌ Write path test FAILED - execution error');
    }
  } catch (error) {
    console.error('\n❌ Write path test FAILED with error:', error);
  }
}

testContract();
