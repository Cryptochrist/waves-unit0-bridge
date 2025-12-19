// Bridge configuration
export const config = {
  // Contract addresses
  unit0Bridge: '0x6e414c9c4FD8aC1f193Bc94a8F25fc44394c9fe6',
  wavesBridge: '3P8hdbRCjwTAK3SYk6ixfS3kknUcWpsr7WL',

  // Network settings
  unit0: {
    chainId: 88811,
    chainIdHex: '0x15AEB',
    name: 'Unit0',
    rpcUrl: 'https://rpc.unit0.dev',
    explorer: 'https://explorer.unit0.dev',
    nativeCurrency: {
      name: 'UNIT0',
      symbol: 'UNIT0',
      decimals: 18,
    },
  },

  waves: {
    nodeUrl: 'https://nodes.wavesnodes.com',
    chainId: 'W',
    explorer: 'https://wavesexplorer.com',
  },

  // Validator API
  validatorApi: 'http://localhost:8080',
};

// Bridge ABI (only functions we need)
export const BRIDGE_ABI = [
  'function lockERC20(address token, uint256 amount, string calldata wavesDestination) external returns (bytes32)',
  'function lockNFT(address token, uint256 tokenId, string calldata wavesRecipient) external',
  'function getWrappedToken(string calldata wavesAssetId) view returns (address)',
  'function getRegisteredTokens() view returns (address[])',
  'function wavesToUnit0Token(string calldata wavesAssetId) view returns (address)',
  'function registerToken(string calldata wavesAssetId, string calldata name, string calldata symbol, uint8 wavesDecimals, uint8 unit0Decimals) external returns (address)',
  'event TokensLocked(bytes32 indexed lockId, address indexed token, uint256 amount, address indexed sender, string wavesDestination, uint256 nonce, uint8 tokenType, uint256 tokenId)',
  'event TokensReleased(bytes32 indexed wavesTransferId, address indexed token, uint256 amount, address indexed recipient, uint8 tokenType, uint256 tokenId)',
  'event TokenRegistered(string wavesAssetId, address unit0Token)',
];

// ERC20 ABI
export const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
];
