const hre = require("hardhat");
const readline = require("readline");
const { ethers } = require("ethers");

// Create readline interface for user input
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
  console.log("   WAVES-Unit0 Bridge Deployment");
  console.log("==========================================\n");

  // Get private key from user
  const privateKey = await prompt("Enter your EVM private key (with or without 0x): ");

  if (!privateKey || privateKey.replace("0x", "").length !== 64) {
    console.error("Invalid private key. Should be 64 hex characters.");
    process.exit(1);
  }

  // Create wallet from private key
  const formattedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const wallet = new ethers.Wallet(formattedKey.trim());
  console.log("\nDeployer address:", wallet.address);

  // Connect to network
  const provider = new ethers.JsonRpcProvider(process.env.UNIT0_RPC_URL || "https://rpc.unit0.dev");
  const connectedWallet = wallet.connect(provider);

  // Check balance
  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "UNIT0\n");

  if (balance === 0n) {
    console.error("No funds in wallet. Please add UNIT0 tokens for gas.");
    process.exit(1);
  }

  // Confirm deployment
  const confirm = await prompt("Proceed with deployment? (yes/no): ");
  if (confirm.toLowerCase() !== "yes") {
    console.log("Deployment cancelled.");
    process.exit(0);
  }

  console.log("\nDeploying contracts...\n");

  // Get contract factories
  const WrappedERC20 = await hre.ethers.getContractFactory("WrappedERC20", connectedWallet);
  const WrappedTokenFactory = await hre.ethers.getContractFactory("WrappedTokenFactory", connectedWallet);
  const WavesUnit0Bridge = await hre.ethers.getContractFactory("WavesUnit0Bridge", connectedWallet);

  // Deploy implementation
  console.log("1/3 Deploying WrappedERC20 implementation...");
  const wrappedImpl = await WrappedERC20.deploy();
  await wrappedImpl.waitForDeployment();
  const wrappedImplAddress = await wrappedImpl.getAddress();
  console.log("    WrappedERC20 implementation:", wrappedImplAddress);

  // Deploy factory
  console.log("2/3 Deploying WrappedTokenFactory...");
  const factory = await WrappedTokenFactory.deploy(wrappedImplAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("    WrappedTokenFactory:", factoryAddress);

  // Get config
  const treasuryAddress = await prompt("\nEnter treasury address (receives fees) [default: deployer]: ");
  const treasury = treasuryAddress.trim() || wallet.address;

  const thresholdInput = await prompt("Enter validator threshold (how many validators needed) [default: 1]: ");
  const threshold = parseInt(thresholdInput) || 1;

  // Deploy bridge
  console.log("\n3/3 Deploying WavesUnit0Bridge...");
  const bridge = await WavesUnit0Bridge.deploy(
    factoryAddress,
    treasury,
    threshold
  );
  await bridge.waitForDeployment();
  const bridgeAddress = await bridge.getAddress();
  console.log("    WavesUnit0Bridge:", bridgeAddress);

  // Set bridge address in factory
  console.log("\nConfiguring factory...");
  const setTx = await factory.setBridge(bridgeAddress);
  await setTx.wait();

  console.log("\n==========================================");
  console.log("   Deployment Complete!");
  console.log("==========================================");
  console.log("\nContract Addresses:");
  console.log("  WrappedERC20 (impl):", wrappedImplAddress);
  console.log("  WrappedTokenFactory:", factoryAddress);
  console.log("  WavesUnit0Bridge:   ", bridgeAddress);
  console.log("\nSave the bridge address for your validator .env:");
  console.log(`  UNIT0_BRIDGE_ADDRESS=${bridgeAddress}`);
  console.log("\n⚠️  Your private key was NOT stored anywhere.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
