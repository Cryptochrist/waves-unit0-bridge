const { ethers } = require("hardhat");

/**
 * Deploy a UnitsMintableERC20 token compatible with Units Network StandardBridge
 *
 * This script deploys tokens that can be registered with the native Units Network
 * bridge at 0x2EE5715961C45bd16EB5c2739397B8E871A46F9f
 *
 * After deployment:
 * 1. Wait for block finalization (check via bridge.isFinalized)
 * 2. Register via ChainContract.registerAssets on WAVES
 * 3. Verify registration on Unit0
 */
async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying UnitsMintableERC20 with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Configuration
  const TOKEN_NAME = process.env.TOKEN_NAME || "My Token";
  const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL || "MTK";
  const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS || "18");
  const WAVES_ASSET_ID = process.env.WAVES_ASSET_ID || "";

  // Units Network StandardBridge address (same on all networks)
  const STANDARD_BRIDGE = "0x2EE5715961C45bd16EB5c2739397B8E871A46F9f";

  // Or use our custom bridge
  const BRIDGE_ADDRESS = process.env.BRIDGE_ADDRESS || STANDARD_BRIDGE;

  console.log("\n=== Token Configuration ===");
  console.log("Name:", TOKEN_NAME);
  console.log("Symbol:", TOKEN_SYMBOL);
  console.log("Decimals:", TOKEN_DECIMALS);
  console.log("WAVES Asset ID:", WAVES_ASSET_ID || "(not set)");
  console.log("Bridge:", BRIDGE_ADDRESS);
  console.log("===========================\n");

  // Deploy UnitsMintableERC20
  console.log("Deploying UnitsMintableERC20...");
  const UnitsMintableERC20 = await ethers.getContractFactory("UnitsMintableERC20");
  const token = await UnitsMintableERC20.deploy(
    BRIDGE_ADDRESS,
    TOKEN_NAME,
    TOKEN_SYMBOL,
    TOKEN_DECIMALS,
    WAVES_ASSET_ID
  );
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();

  console.log("\n=== Deployment Complete ===");
  console.log("Token Address:", tokenAddress);
  console.log("Bridge Address:", BRIDGE_ADDRESS);
  console.log("===========================\n");

  // Verify token details
  console.log("Verifying deployment...");
  const name = await token.name();
  const symbol = await token.symbol();
  const decimals = await token.decimals();
  const bridge = await token.bridge();
  const wavesAssetId = await token.wavesAssetId();

  console.log("Name:", name);
  console.log("Symbol:", symbol);
  console.log("Decimals:", decimals);
  console.log("Bridge:", bridge);
  console.log("WAVES Asset ID:", wavesAssetId);

  // Save deployment info
  const fs = require("fs");
  const chainId = (await ethers.provider.getNetwork()).chainId.toString();
  const deployment = {
    network: (await ethers.provider.getNetwork()).name,
    chainId,
    tokenAddress,
    name: TOKEN_NAME,
    symbol: TOKEN_SYMBOL,
    decimals: TOKEN_DECIMALS,
    bridge: BRIDGE_ADDRESS,
    wavesAssetId: WAVES_ASSET_ID,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  const fileName = `token-${TOKEN_SYMBOL.toLowerCase()}-${chainId}-${Date.now()}.json`;
  fs.writeFileSync(fileName, JSON.stringify(deployment, null, 2));
  console.log(`\nDeployment info saved to ${fileName}`);

  // Next steps
  console.log("\n=== Next Steps ===");
  if (BRIDGE_ADDRESS === STANDARD_BRIDGE) {
    console.log("Using Units Network StandardBridge:");
    console.log("1. Wait for block finalization");
    console.log("2. On WAVES, call ChainContract.registerAssets() or issueAndRegister()");
    console.log("3. Verify registration on Unit0 via StandardBridge.tokenRatios()");
  } else {
    console.log("Using Custom Bridge:");
    console.log("1. Register token on the custom bridge");
    console.log("2. Register corresponding asset on WAVES bridge dApp");
  }
  console.log("==================\n");

  return deployment;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
