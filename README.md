# WAVES ↔ Unit0 Custom Token Bridge

A fully decentralized cross-chain bridge for transferring custom tokens between WAVES (Layer 0) and Unit0 (Layer 1).

## Overview

This bridge enables the transfer of **any custom token** between WAVES and Unit0, extending beyond the native UNIT0 token bridging that Units Network provides.

### Supported Asset Types

| Asset Type | WAVES Standard | Unit0 Standard |
|------------|----------------|----------------|
| Fungible Tokens | WAVES Assets | ERC-20 |
| NFTs | WAVES NFT | ERC-721 |
| Multi-tokens | - | ERC-1155 |

## Architecture

The bridge consists of:

1. **Unit0 Contracts (Solidity)**
   - `WavesUnit0Bridge.sol` - Main bridge contract
   - `WrappedTokenFactory.sol` - Factory for creating wrapped tokens
   - `WrappedERC20.sol` - ERC20 token representing wrapped WAVES assets
   - `UnitsMintableERC20.sol` - Units Network compatible ERC20

2. **WAVES Contract (Ride)**
   - `bridge.ride` - Bridge dApp for WAVES

3. **Validator Network** (off-chain)
   - Monitors both chains
   - Signs cross-chain transfer attestations

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required variables:
- `PRIVATE_KEY` - Deployer private key
- `UNIT0_RPC_URL` - Unit0 RPC endpoint
- `TREASURY_ADDRESS` - Fee collection address
- `VALIDATOR_THRESHOLD` - Required signatures (M of N)

## Compilation

```bash
npm run compile
```

## Deployment

### Local Development

```bash
# Start local node
npm run node

# Deploy in another terminal
npm run deploy:localhost
```

### Unit0 Testnet

```bash
npm run deploy:unit0-testnet
```

### Unit0 Mainnet

```bash
npm run deploy:unit0
```

## Usage

### Register a Native Unit0 Token

```bash
BRIDGE_ADDRESS=0x... \
TOKEN_TYPE=native \
NATIVE_TOKEN_ADDRESS=0x... \
WAVES_ASSET_ID=abc123... \
WAVES_DECIMALS=8 \
npm run register-token
```

### Create a Wrapped WAVES Token

```bash
BRIDGE_ADDRESS=0x... \
TOKEN_TYPE=wrapped \
WAVES_ASSET_ID=abc123... \
WRAPPED_NAME="Wrapped My Token" \
WRAPPED_SYMBOL=wMTK \
WAVES_DECIMALS=8 \
UNIT0_DECIMALS=18 \
npm run register-token
```

### Add Validators

```bash
BRIDGE_ADDRESS=0x... \
VALIDATOR_ADDRESSES=0x111...,0x222...,0x333... \
npm run add-validators
```

### Deploy Units Network Compatible Token

```bash
TOKEN_NAME="My Token" \
TOKEN_SYMBOL=MTK \
TOKEN_DECIMALS=18 \
WAVES_ASSET_ID=abc123... \
npm run deploy:token
```

## Contract Addresses

### Units Network StandardBridge
- **All Networks**: `0x2EE5715961C45bd16EB5c2739397B8E871A46F9f`

### RPC Endpoints
- **Mainnet**: `https://rpc.unit0.dev`
- **Testnet**: `https://rpc-testnet.unit0.dev`

## Security

- **M-of-N Multisig**: Validators sign cross-chain attestations
- **Daily Limits**: Per-token transfer limits
- **Pausable**: Emergency pause functionality
- **Rate Limiting**: Protection against large unexpected flows

## Fees

- **Bridge Fee**: 0.1% (configurable)
- **Validator Fee**: 0.05% (configurable)
- **Max Total**: 10%

## Testing

```bash
npm test
```

## License

MIT

## Links

- [Units Network Docs](https://docs.units.network)
- [WAVES Documentation](https://docs.waves.tech)
- [Architecture Document](./ARCHITECTURE.md)
