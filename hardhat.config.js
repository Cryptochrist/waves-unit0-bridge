require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    // Local development network
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },

    // Unit0 Mainnet
    unit0: {
      url: process.env.UNIT0_RPC_URL || "https://rpc.unit0.dev",
      chainId: 88817, // Update with actual Unit0 mainnet chain ID
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gasPrice: "auto",
    },

    // Unit0 Testnet
    unit0Testnet: {
      url: process.env.UNIT0_TESTNET_RPC_URL || "https://rpc-testnet.unit0.dev",
      chainId: 88818, // Update with actual Unit0 testnet chain ID
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gasPrice: "auto",
    },

    // Ethereum Sepolia (for testing)
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      chainId: 11155111,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      unit0: process.env.UNIT0_EXPLORER_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "unit0",
        chainId: 88817,
        urls: {
          apiURL: "https://explorer.unit0.dev/api",
          browserURL: "https://explorer.unit0.dev",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts/unit0",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 60000,
  },
};
