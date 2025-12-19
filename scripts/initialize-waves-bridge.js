const readline = require("readline");

// WAVES bridge address
const WAVES_BRIDGE_ADDRESS = "3P8hdbRCjwTAK3SYk6ixfS3kknUcWpsr7WL";

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  console.log("==========================================");
  console.log("   Initialize WAVES Bridge");
  console.log("==========================================\n");

  console.log("Bridge Address:", WAVES_BRIDGE_ADDRESS);
  console.log("\nTo initialize the WAVES bridge, you need to call the 'initialize' function.");
  console.log("\n--- Required Parameters ---\n");

  // Get owner address
  const ownerAddress = await prompt("Enter owner WAVES address (your address): ");
  if (!ownerAddress || ownerAddress.length < 35) {
    console.error("Invalid WAVES address.");
    process.exit(1);
  }

  // Get threshold
  const thresholdInput = await prompt("Enter validator threshold [default: 1]: ");
  const threshold = parseInt(thresholdInput) || 1;

  // Get treasury address
  const treasuryInput = await prompt("Enter treasury WAVES address [default: owner]: ");
  const treasury = treasuryInput.trim() || ownerAddress;

  // Get validator public keys
  console.log("\n--- Validator Public Keys ---");
  console.log("Enter the BASE58 public keys of validators.");
  console.log("(You can find your public key in WAVES Keeper or Signer)\n");

  const validatorPubKeys = [];
  let index = 1;

  while (true) {
    const pubKey = await prompt(`Validator ${index} public key (or Enter to finish): `);

    if (!pubKey || pubKey.trim() === "") {
      break;
    }

    validatorPubKeys.push(pubKey.trim());
    console.log(`  Added: ${pubKey.trim()}`);
    index++;
  }

  if (validatorPubKeys.length < threshold) {
    console.error(`\nError: Need at least ${threshold} validator(s) for threshold.`);
    process.exit(1);
  }

  // Show summary
  console.log("\n==========================================");
  console.log("   Initialization Parameters");
  console.log("==========================================\n");
  console.log("Owner:", ownerAddress);
  console.log("Threshold:", threshold);
  console.log("Treasury:", treasury);
  console.log("Validators:", validatorPubKeys.length);
  validatorPubKeys.forEach((pk, i) => console.log(`  ${i + 1}. ${pk}`));

  console.log("\n==========================================");
  console.log("   How to Initialize");
  console.log("==========================================\n");

  console.log("Use WAVES Keeper, Signer, or waves-transactions to call:\n");

  console.log("Function: initialize");
  console.log("Arguments:");
  console.log(`  1. owner (String): "${ownerAddress}"`);
  console.log(`  2. threshold (Int): ${threshold}`);
  console.log(`  3. treasury (String): "${treasury}"`);
  console.log(`  4. validatorPubKeys (List[String]): [${validatorPubKeys.map(pk => `"${pk}"`).join(", ")}]`);

  console.log("\n--- Using waves-transactions (Node.js) ---\n");
  console.log(`
const { invokeScript, broadcast } = require('@waves/waves-transactions');

const seed = 'YOUR_SEED_PHRASE';

const tx = invokeScript({
  dApp: '${WAVES_BRIDGE_ADDRESS}',
  call: {
    function: 'initialize',
    args: [
      { type: 'string', value: '${ownerAddress}' },
      { type: 'integer', value: ${threshold} },
      { type: 'string', value: '${treasury}' },
      { type: 'list', value: [${validatorPubKeys.map(pk => `{ type: 'string', value: '${pk}' }`).join(', ')}] }
    ]
  },
  chainId: 'W'  // 'W' for mainnet, 'T' for testnet
}, seed);

broadcast(tx, 'https://nodes.wavesnodes.com').then(console.log);
`);

  console.log("\n--- Using WAVES Keeper ---\n");
  console.log("1. Go to https://waves-dapp.com");
  console.log(`2. Enter dApp address: ${WAVES_BRIDGE_ADDRESS}`);
  console.log("3. Call 'initialize' with the parameters above");
  console.log("4. Sign with WAVES Keeper\n");

  const continueWithNode = await prompt("Do you want to run the initialization now with waves-transactions? (yes/no): ");

  if (continueWithNode.toLowerCase() === "yes") {
    console.log("\nTo proceed, you'll need to install @waves/waves-transactions:");
    console.log("  npm install @waves/waves-transactions\n");

    const seedPhrase = await prompt("Enter your WAVES seed phrase (15 words): ");

    if (!seedPhrase || seedPhrase.split(" ").length < 12) {
      console.error("Invalid seed phrase.");
      process.exit(1);
    }

    try {
      const { invokeScript, broadcast } = require('@waves/waves-transactions');

      console.log("\nSending initialization transaction...");

      const tx = invokeScript({
        dApp: WAVES_BRIDGE_ADDRESS,
        call: {
          function: 'initialize',
          args: [
            { type: 'string', value: ownerAddress },
            { type: 'integer', value: threshold },
            { type: 'string', value: treasury },
            { type: 'list', value: validatorPubKeys.map(pk => ({ type: 'string', value: pk })) }
          ]
        },
        chainId: 'W',
        fee: 500000
      }, seedPhrase.trim());

      const result = await broadcast(tx, 'https://nodes.wavesnodes.com');

      console.log("\n==========================================");
      console.log("   Bridge Initialized!");
      console.log("==========================================\n");
      console.log("Transaction ID:", result.id);
      console.log(`Explorer: https://wavesexplorer.com/tx/${result.id}`);

    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        console.error("\n@waves/waves-transactions not installed.");
        console.error("Run: npm install @waves/waves-transactions");
      } else {
        console.error("\nTransaction failed:", error.message);
      }
      process.exit(1);
    }
  }

  console.log("\n==========================================");
  console.log("   Next Steps");
  console.log("==========================================\n");
  console.log("1. After initialization, configure your validator .env:");
  console.log(`   WAVES_BRIDGE_ADDRESS=${WAVES_BRIDGE_ADDRESS}`);
  console.log("   UNIT0_BRIDGE_ADDRESS=0xdb36bAdfc6620F33035FEc568E095f7Ee393Cf50");
  console.log("\n2. Start your validator node:");
  console.log("   cd validator && npm run start");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
