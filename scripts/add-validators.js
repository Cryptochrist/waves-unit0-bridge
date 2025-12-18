const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  // Get bridge address from command line or environment
  const BRIDGE_ADDRESS = process.env.BRIDGE_ADDRESS;
  if (!BRIDGE_ADDRESS) {
    console.error("Please set BRIDGE_ADDRESS environment variable");
    process.exit(1);
  }

  // Validator addresses to add (from command line or environment)
  // Format: comma-separated addresses
  const VALIDATOR_ADDRESSES = process.env.VALIDATOR_ADDRESSES?.split(",") || [];
  if (VALIDATOR_ADDRESSES.length === 0) {
    console.error("Please set VALIDATOR_ADDRESSES environment variable (comma-separated)");
    process.exit(1);
  }

  console.log("Adding validators to bridge:", BRIDGE_ADDRESS);
  console.log("Validators to add:", VALIDATOR_ADDRESSES);

  // Connect to bridge
  const WavesUnit0Bridge = await ethers.getContractFactory("WavesUnit0Bridge");
  const bridge = WavesUnit0Bridge.attach(BRIDGE_ADDRESS);

  // Add each validator
  for (const validatorAddress of VALIDATOR_ADDRESSES) {
    const address = validatorAddress.trim();
    if (!ethers.isAddress(address)) {
      console.log(`Skipping invalid address: ${address}`);
      continue;
    }

    // Check if already a validator
    const validator = await bridge.validators(address);
    if (validator.isActive) {
      console.log(`${address} is already an active validator`);
      continue;
    }

    console.log(`Adding validator: ${address}`);
    const tx = await bridge.addValidator(address);
    await tx.wait();
    console.log(`  Added! Tx: ${tx.hash}`);
  }

  // Get current validator count
  const activeCount = await bridge.activeValidatorCount();
  const threshold = await bridge.validatorThreshold();
  console.log(`\nCurrent validators: ${activeCount}`);
  console.log(`Threshold: ${threshold}`);

  // Get all validators
  const validators = await bridge.getActiveValidators();
  console.log("Active validators:", validators);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
