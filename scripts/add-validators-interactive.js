const hre = require("hardhat");
const readline = require("readline");
const { ethers } = require("ethers");

// Bridge ABI (only the functions we need)
const BRIDGE_ABI = [
  "function addValidator(address validator) external",
  "function removeValidator(address validator) external",
  "function validators(address) view returns (bool isActive, uint256 addedAt, uint256 removedAt)",
  "function activeValidatorCount() view returns (uint256)",
  "function validatorThreshold() view returns (uint256)",
  "function owner() view returns (address)",
  "function getActiveValidators() view returns (address[])",
];

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
  console.log("   Add Validators to Bridge");
  console.log("==========================================\n");

  // Get private key
  const privateKey = await prompt("Enter your EVM private key (bridge owner): ");

  if (!privateKey || privateKey.replace("0x", "").length !== 64) {
    console.error("Invalid private key. Should be 64 hex characters.");
    process.exit(1);
  }

  const formattedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const wallet = new ethers.Wallet(formattedKey.trim());
  console.log("\nYour address:", wallet.address);

  // Get bridge address
  const bridgeAddress = await prompt("\nEnter bridge contract address: ");

  if (!bridgeAddress || !bridgeAddress.startsWith("0x") || bridgeAddress.length !== 42) {
    console.error("Invalid bridge address.");
    process.exit(1);
  }

  // Connect to network
  const provider = new ethers.JsonRpcProvider(process.env.UNIT0_RPC_URL || "https://rpc.unit0.dev");
  const connectedWallet = wallet.connect(provider);

  // Connect to bridge
  const bridge = new ethers.Contract(bridgeAddress, BRIDGE_ABI, connectedWallet);

  // Check if caller is owner
  const owner = await bridge.owner();
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.error(`\nError: You are not the bridge owner.`);
    console.error(`Owner: ${owner}`);
    console.error(`Your address: ${wallet.address}`);
    process.exit(1);
  }

  // Show current status
  const validatorCount = await bridge.activeValidatorCount();
  const threshold = await bridge.validatorThreshold();
  console.log(`\nCurrent validators: ${validatorCount}`);
  console.log(`Required threshold: ${threshold}`);

  // Get validator addresses
  console.log("\n--- Add Validators ---");
  console.log("Enter validator addresses one per line.");
  console.log("Press Enter with empty input when done.\n");

  const validators = [];
  let index = 1;

  while (true) {
    const validatorAddress = await prompt(`Validator ${index} address (or Enter to finish): `);

    if (!validatorAddress || validatorAddress.trim() === "") {
      break;
    }

    if (!validatorAddress.startsWith("0x") || validatorAddress.length !== 42) {
      console.log("  Invalid address format. Try again.");
      continue;
    }

    // Check if already a validator
    const validatorInfo = await bridge.validators(validatorAddress);
    if (validatorInfo.isActive) {
      console.log(`  ${validatorAddress} is already a validator. Skipping.`);
      continue;
    }

    validators.push(validatorAddress);
    console.log(`  Added: ${validatorAddress}`);
    index++;
  }

  if (validators.length === 0) {
    console.log("\nNo validators to add. Exiting.");
    process.exit(0);
  }

  // Confirm
  console.log(`\n--- Confirm ---`);
  console.log(`Adding ${validators.length} validator(s):`);
  validators.forEach((v, i) => console.log(`  ${i + 1}. ${v}`));

  const confirm = await prompt("\nProceed? (yes/no): ");
  if (confirm.toLowerCase() !== "yes") {
    console.log("Cancelled.");
    process.exit(0);
  }

  // Add validators
  console.log("\nAdding validators...\n");

  for (let i = 0; i < validators.length; i++) {
    const validator = validators[i];
    console.log(`${i + 1}/${validators.length} Adding ${validator}...`);

    try {
      const tx = await bridge.addValidator(validator);
      console.log(`   Tx: ${tx.hash}`);
      await tx.wait();
      console.log(`   ✓ Confirmed`);
    } catch (error) {
      console.log(`   ✗ Failed: ${error.message}`);
    }
  }

  // Show final status
  const finalCount = await bridge.activeValidatorCount();
  console.log(`\n==========================================`);
  console.log(`   Complete!`);
  console.log(`==========================================`);
  console.log(`\nActive validators: ${finalCount}`);
  console.log(`Threshold: ${threshold}`);

  if (finalCount >= threshold) {
    console.log(`\n✓ Bridge has enough validators to operate.`);
  } else {
    console.log(`\n⚠ Bridge needs ${threshold - finalCount} more validator(s).`);
  }

  console.log("\n⚠️  Your private key was NOT stored anywhere.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
