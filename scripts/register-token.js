const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  // Configuration from environment
  const BRIDGE_ADDRESS = process.env.BRIDGE_ADDRESS;
  const TOKEN_TYPE = process.env.TOKEN_TYPE || "native"; // "native" or "wrapped"

  // For native Unit0 tokens being bridged to WAVES
  const NATIVE_TOKEN_ADDRESS = process.env.NATIVE_TOKEN_ADDRESS;
  const WAVES_ASSET_ID = process.env.WAVES_ASSET_ID;
  const WAVES_DECIMALS = parseInt(process.env.WAVES_DECIMALS || "8");

  // For wrapped WAVES tokens being created on Unit0
  const WRAPPED_NAME = process.env.WRAPPED_NAME;
  const WRAPPED_SYMBOL = process.env.WRAPPED_SYMBOL;
  const UNIT0_DECIMALS = parseInt(process.env.UNIT0_DECIMALS || "18");

  if (!BRIDGE_ADDRESS) {
    console.error("Please set BRIDGE_ADDRESS environment variable");
    process.exit(1);
  }

  console.log("Registering token on bridge:", BRIDGE_ADDRESS);
  console.log("Token type:", TOKEN_TYPE);

  // Connect to bridge
  const WavesUnit0Bridge = await ethers.getContractFactory("WavesUnit0Bridge");
  const bridge = WavesUnit0Bridge.attach(BRIDGE_ADDRESS);

  if (TOKEN_TYPE === "native") {
    // Register a native Unit0 token for bridging to WAVES
    if (!NATIVE_TOKEN_ADDRESS || !WAVES_ASSET_ID) {
      console.error("For native tokens, set NATIVE_TOKEN_ADDRESS and WAVES_ASSET_ID");
      process.exit(1);
    }

    console.log(`\nRegistering native token:`);
    console.log(`  Unit0 Address: ${NATIVE_TOKEN_ADDRESS}`);
    console.log(`  WAVES Asset ID: ${WAVES_ASSET_ID}`);
    console.log(`  WAVES Decimals: ${WAVES_DECIMALS}`);

    const tx = await bridge.registerNativeToken(
      NATIVE_TOKEN_ADDRESS,
      WAVES_ASSET_ID,
      WAVES_DECIMALS
    );
    await tx.wait();
    console.log(`  Registered! Tx: ${tx.hash}`);

  } else if (TOKEN_TYPE === "wrapped") {
    // Create a wrapped token for a WAVES asset
    if (!WAVES_ASSET_ID || !WRAPPED_NAME || !WRAPPED_SYMBOL) {
      console.error("For wrapped tokens, set WAVES_ASSET_ID, WRAPPED_NAME, and WRAPPED_SYMBOL");
      process.exit(1);
    }

    console.log(`\nCreating wrapped token:`);
    console.log(`  WAVES Asset ID: ${WAVES_ASSET_ID}`);
    console.log(`  Name: ${WRAPPED_NAME}`);
    console.log(`  Symbol: ${WRAPPED_SYMBOL}`);
    console.log(`  WAVES Decimals: ${WAVES_DECIMALS}`);
    console.log(`  Unit0 Decimals: ${UNIT0_DECIMALS}`);

    const tx = await bridge.createWrappedToken(
      WAVES_ASSET_ID,
      WRAPPED_NAME,
      WRAPPED_SYMBOL,
      WAVES_DECIMALS,
      UNIT0_DECIMALS
    );
    const receipt = await tx.wait();

    // Get the wrapped token address from events
    const event = receipt.logs.find(log => {
      try {
        const parsed = bridge.interface.parseLog(log);
        return parsed?.name === "TokenRegistered";
      } catch {
        return false;
      }
    });

    if (event) {
      const parsed = bridge.interface.parseLog(event);
      console.log(`  Wrapped Token Address: ${parsed.args.unit0Token}`);
    }

    console.log(`  Created! Tx: ${tx.hash}`);
  } else {
    console.error("TOKEN_TYPE must be 'native' or 'wrapped'");
    process.exit(1);
  }

  // Verify registration
  const tokenAddress = TOKEN_TYPE === "native"
    ? NATIVE_TOKEN_ADDRESS
    : await bridge.wavesToUnit0Token(WAVES_ASSET_ID);

  const tokenInfo = await bridge.tokenRegistry(tokenAddress);
  console.log(`\nToken Info:`);
  console.log(`  WAVES Asset ID: ${tokenInfo.wavesAssetId}`);
  console.log(`  Is Native: ${tokenInfo.isNative}`);
  console.log(`  Is Wrapped: ${tokenInfo.isWrapped}`);
  console.log(`  Is Active: ${tokenInfo.isActive}`);
  console.log(`  WAVES Decimals: ${tokenInfo.wavesDecimals}`);
  console.log(`  Unit0 Decimals: ${tokenInfo.unit0Decimals}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
