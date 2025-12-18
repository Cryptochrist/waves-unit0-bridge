const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Configuration
  const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || deployer.address;
  const VALIDATOR_THRESHOLD = parseInt(process.env.VALIDATOR_THRESHOLD || "1");

  console.log("\n=== Deployment Configuration ===");
  console.log("Treasury:", TREASURY_ADDRESS);
  console.log("Validator Threshold:", VALIDATOR_THRESHOLD);
  console.log("================================\n");

  // 1. Deploy WrappedERC20 implementation (for cloning)
  console.log("1. Deploying WrappedERC20 implementation...");
  const WrappedERC20 = await ethers.getContractFactory("WrappedERC20");
  const wrappedERC20Impl = await WrappedERC20.deploy();
  await wrappedERC20Impl.waitForDeployment();
  const wrappedERC20ImplAddress = await wrappedERC20Impl.getAddress();
  console.log("   WrappedERC20 Implementation:", wrappedERC20ImplAddress);

  // 2. Deploy WrappedTokenFactory
  console.log("2. Deploying WrappedTokenFactory...");
  const WrappedTokenFactory = await ethers.getContractFactory("WrappedTokenFactory");
  const tokenFactory = await WrappedTokenFactory.deploy(wrappedERC20ImplAddress);
  await tokenFactory.waitForDeployment();
  const tokenFactoryAddress = await tokenFactory.getAddress();
  console.log("   WrappedTokenFactory:", tokenFactoryAddress);

  // 3. Deploy WavesUnit0Bridge
  console.log("3. Deploying WavesUnit0Bridge...");
  const WavesUnit0Bridge = await ethers.getContractFactory("WavesUnit0Bridge");
  const bridge = await WavesUnit0Bridge.deploy(
    TREASURY_ADDRESS,
    tokenFactoryAddress,
    VALIDATOR_THRESHOLD
  );
  await bridge.waitForDeployment();
  const bridgeAddress = await bridge.getAddress();
  console.log("   WavesUnit0Bridge:", bridgeAddress);

  // 4. Configure WrappedTokenFactory to use bridge
  console.log("4. Configuring WrappedTokenFactory...");
  const setBridgeTx = await tokenFactory.setBridge(bridgeAddress);
  await setBridgeTx.wait();
  console.log("   Bridge set in WrappedTokenFactory");

  // Summary
  console.log("\n=== Deployment Summary ===");
  console.log("WrappedERC20 Implementation:", wrappedERC20ImplAddress);
  console.log("WrappedTokenFactory:", tokenFactoryAddress);
  console.log("WavesUnit0Bridge:", bridgeAddress);
  console.log("==========================\n");

  // Save addresses to file for later use
  const fs = require("fs");
  const addresses = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    wrappedERC20Implementation: wrappedERC20ImplAddress,
    wrappedTokenFactory: tokenFactoryAddress,
    wavesUnit0Bridge: bridgeAddress,
    treasury: TREASURY_ADDRESS,
    validatorThreshold: VALIDATOR_THRESHOLD,
    deployedAt: new Date().toISOString(),
  };

  const fileName = `deployment-${addresses.chainId}-${Date.now()}.json`;
  fs.writeFileSync(fileName, JSON.stringify(addresses, null, 2));
  console.log(`Deployment addresses saved to ${fileName}`);

  return addresses;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
