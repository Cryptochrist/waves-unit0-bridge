import { ValidatorConfig } from '../types/index.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): ValidatorConfig {
  const config: ValidatorConfig = {
    // WAVES configuration
    wavesNodeUrl: process.env.WAVES_NODE_URL || 'https://nodes.wavesnodes.com',
    wavesChainId: process.env.WAVES_CHAIN_ID || 'W', // W = mainnet, T = testnet

    // Unit0 configuration
    unit0RpcUrl: process.env.UNIT0_RPC_URL || 'https://rpc.unit0.dev',
    unit0ChainId: parseInt(process.env.UNIT0_CHAIN_ID || '88817'),

    // Contract addresses
    wavesBridgeAddress: process.env.WAVES_BRIDGE_ADDRESS || '',
    unit0BridgeAddress: process.env.UNIT0_BRIDGE_ADDRESS || '',

    // Validator credentials
    validatorPrivateKey: process.env.VALIDATOR_PRIVATE_KEY || '',
    validatorAddress: process.env.VALIDATOR_ADDRESS || '',
    wavesSeed: process.env.WAVES_SEED || undefined,

    // P2P configuration
    p2pPort: parseInt(process.env.P2P_PORT || '9000'),
    p2pBootstrapPeers: (process.env.P2P_BOOTSTRAP_PEERS || '').split(',').filter(Boolean),

    // Confirmation requirements
    wavesConfirmations: parseInt(process.env.WAVES_CONFIRMATIONS || '10'),
    unit0Confirmations: parseInt(process.env.UNIT0_CONFIRMATIONS || '32'),

    // Database
    dbPath: process.env.DB_PATH || path.join(process.cwd(), 'data', 'validator.db'),

    // API
    apiPort: parseInt(process.env.API_PORT || '8080'),
    apiEnabled: process.env.API_ENABLED !== 'false',

    // Logging
    logLevel: process.env.LOG_LEVEL || 'info',
  };

  // Validate required fields
  validateConfig(config);

  return config;
}

function validateConfig(config: ValidatorConfig): void {
  const errors: string[] = [];

  if (!config.wavesBridgeAddress) {
    errors.push('WAVES_BRIDGE_ADDRESS is required');
  }

  if (!config.unit0BridgeAddress) {
    errors.push('UNIT0_BRIDGE_ADDRESS is required');
  }

  if (!config.validatorPrivateKey) {
    errors.push('VALIDATOR_PRIVATE_KEY is required');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}

/**
 * Default configuration for development
 */
export const defaultConfig: Partial<ValidatorConfig> = {
  wavesNodeUrl: 'https://nodes-testnet.wavesnodes.com',
  wavesChainId: 'T',
  unit0RpcUrl: 'https://rpc-testnet.unit0.dev',
  unit0ChainId: 88818,
  wavesConfirmations: 5,
  unit0Confirmations: 12,
  logLevel: 'debug',
};
