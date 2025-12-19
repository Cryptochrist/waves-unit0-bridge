#!/usr/bin/env node

import { Command } from 'commander';
import { ethers } from 'ethers';
import { loadConfig } from './config';
import { ValidatorNode } from './index';

const program = new Command();

program
  .name('waves-unit0-validator')
  .description('Validator node for WAVES-Unit0 bridge')
  .version('1.0.0');

// Start command
program
  .command('start')
  .description('Start the validator node')
  .option('--log-level <level>', 'Log level (debug, info, warn, error)', 'info')
  .action(async (options) => {
    console.log('===========================================');
    console.log('    WAVES-Unit0 Bridge Validator Node');
    console.log('===========================================\n');

    try {
      // Override log level if specified
      if (options.logLevel) {
        process.env.LOG_LEVEL = options.logLevel;
      }

      const config = loadConfig();
      const validator = new ValidatorNode(config);

      // Handle shutdown signals
      const shutdown = async () => {
        console.log('\nShutting down...');
        await validator.stop();
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      // Start the validator
      await validator.start();

      console.log('\nValidator is running. Press Ctrl+C to stop.\n');
    } catch (error) {
      console.error('Fatal error:', error);
      process.exit(1);
    }
  });

// Generate keypair command
program
  .command('generate-key')
  .description('Generate a new validator keypair')
  .action(() => {
    const wallet = ethers.Wallet.createRandom();

    console.log('===========================================');
    console.log('    New Validator Keypair Generated');
    console.log('===========================================\n');
    console.log('Address:', wallet.address);
    console.log('Private Key:', wallet.privateKey);
    console.log('\n⚠️  IMPORTANT: Save the private key securely!');
    console.log('   Never share it or commit it to version control.\n');
    console.log('Add these to your .env file:');
    console.log(`VALIDATOR_PRIVATE_KEY=${wallet.privateKey}`);
    console.log(`VALIDATOR_ADDRESS=${wallet.address}`);
  });

// Check config command
program
  .command('check-config')
  .description('Verify configuration is valid')
  .action(() => {
    try {
      const config = loadConfig();

      console.log('===========================================');
      console.log('    Configuration Valid');
      console.log('===========================================\n');
      console.log('WAVES Node URL:', config.wavesNodeUrl);
      console.log('WAVES Chain ID:', config.wavesChainId);
      console.log('Unit0 RPC URL:', config.unit0RpcUrl);
      console.log('Unit0 Chain ID:', config.unit0ChainId);
      console.log('WAVES Bridge:', config.wavesBridgeAddress);
      console.log('Unit0 Bridge:', config.unit0BridgeAddress);
      console.log('Validator:', config.validatorAddress);
      console.log('P2P Port:', config.p2pPort);
      console.log('API Port:', config.apiPort);
      console.log('API Enabled:', config.apiEnabled);
      console.log('Log Level:', config.logLevel);
    } catch (error: any) {
      console.error('Configuration error:', error.message);
      process.exit(1);
    }
  });

// Status command (for checking a running validator)
program
  .command('status')
  .description('Check status of a running validator node')
  .option('-p, --port <port>', 'API port', '8080')
  .option('-h, --host <host>', 'API host', 'localhost')
  .action(async (options) => {
    try {
      const response = await fetch(`http://${options.host}:${options.port}/status`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const status = await response.json() as {
        isRunning: boolean;
        validatorAddress: string;
        wavesHeight: number;
        unit0Height: number;
        connectedPeers: number;
        pendingTransfers: number;
      };

      console.log('===========================================');
      console.log('    Validator Status');
      console.log('===========================================\n');
      console.log('Running:', status.isRunning);
      console.log('Validator:', status.validatorAddress);
      console.log('WAVES Height:', status.wavesHeight);
      console.log('Unit0 Height:', status.unit0Height);
      console.log('Connected Peers:', status.connectedPeers);
      console.log('Pending Transfers:', status.pendingTransfers);
    } catch (error: any) {
      console.error('Failed to connect to validator:', error.message);
      console.log('Make sure the validator is running and API is enabled.');
      process.exit(1);
    }
  });

// Stats command
program
  .command('stats')
  .description('Get transfer statistics from a running validator')
  .option('-p, --port <port>', 'API port', '8080')
  .option('-h, --host <host>', 'API host', 'localhost')
  .action(async (options) => {
    try {
      const response = await fetch(`http://${options.host}:${options.port}/stats`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const stats = await response.json() as {
        totalTransfers: number;
        pendingTransfers: number;
        completedTransfers: number;
        failedTransfers: number;
      };

      console.log('===========================================');
      console.log('    Transfer Statistics');
      console.log('===========================================\n');
      console.log('Total Transfers:', stats.totalTransfers);
      console.log('Pending:', stats.pendingTransfers);
      console.log('Completed:', stats.completedTransfers);
      console.log('Failed:', stats.failedTransfers);
    } catch (error: any) {
      console.error('Failed to get stats:', error.message);
      process.exit(1);
    }
  });

program.parse();
