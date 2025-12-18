# WAVES ↔ Unit0 Custom Token Bridge

## Technical Architecture Specification

**Version:** 1.1.0
**Status:** Draft
**Last Updated:** 2024-12-18

---

## Table of Contents

1. [Overview](#1-overview)
2. [Units Network Context](#2-units-network-context)
3. [System Architecture](#3-system-architecture)
4. [Smart Contracts](#4-smart-contracts)
5. [Validator Network](#5-validator-network)
6. [Token Registry & Wrapping](#6-token-registry--wrapping)
7. [Bridge Flow](#7-bridge-flow)
8. [Security Model](#8-security-model)
9. [Fee Structure](#9-fee-structure)
10. [API Specifications](#10-api-specifications)
11. [Deployment Strategy](#11-deployment-strategy)

---

## 1. Overview

### 1.1 Purpose

This document specifies the architecture for a fully decentralized cross-chain bridge enabling the transfer of **custom tokens** (fungible tokens, NFTs, and other assets) between the WAVES blockchain (Layer 0) and Unit0 (Layer 1, EVM-compatible).

### 1.2 Relationship to Existing Infrastructure

**Important Context**: Units Network already provides native cross-layer transfer capabilities for the UNIT0 token between WAVES (L0) and Unit0 (L1). This bridge extends that functionality to support **any custom token** created on either chain.

| Feature | Native Units Bridge | This Custom Bridge |
|---------|---------------------|-------------------|
| UNIT0 transfers | ✅ Built-in | Not needed |
| WAVES transfers | ✅ Via Chain Contract | Extended support |
| Custom ERC-20 tokens | ❌ | ✅ Full support |
| Custom WAVES assets | ❌ | ✅ Full support |
| NFTs (ERC-721) | ❌ | ✅ Full support |
| Multi-tokens (ERC-1155) | ❌ | ✅ Full support |

### 1.3 Design Principles

- **Decentralization**: No single point of failure or trust
- **Security**: Multi-signature validation with economic incentives
- **Extensibility**: Support for any token standard on both chains
- **Transparency**: All operations verifiable on-chain
- **Efficiency**: Minimize gas costs and finality time
- **Compatibility**: Leverage existing Units Network infrastructure where possible

### 1.4 Supported Asset Types

| Asset Type | WAVES Standard | Unit0 Standard |
|------------|----------------|----------------|
| Fungible Tokens | WAVES Assets / Smart Assets | ERC-20 |
| NFTs | WAVES NFT (amount=1, decimals=0) | ERC-721 |
| Multi-tokens | - | ERC-1155 |
| Native Currency | WAVES | UNIT0 (native at `0x0000...0000`) |

---

## 2. Units Network Context

### 2.1 Layer Architecture

Units Network operates on a **two-layer architecture**:

```
┌─────────────────────────────────────────────────────────────────┐
│                     UNITS NETWORK STACK                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    UNIT0 (Layer 1)                         │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  • EVM-compatible smart contracts                    │  │  │
│  │  │  • Native UNIT0 token (0x000...000)                  │  │  │
│  │  │  • JSON-RPC API (https://rpc.unit0.dev)             │  │  │
│  │  │  • Chain ID: [mainnet/testnet specific]              │  │  │
│  │  │  • Block rewards: 1.8 UNIT0 per block                │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                    Native Bridge Contract                        │
│                    (L1-to-L0 transfers)                          │
│                              │                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    WAVES (Layer 0)                         │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  • Ride smart contracts (dApps)                      │  │  │
│  │  │  • Chain Contract (block metadata, token minting)    │  │  │
│  │  │  • LPoS Consensus                                    │  │  │
│  │  │  • Native WAVES token (8 decimals)                   │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Existing Cross-Layer Transfer (UNIT0 Only)

The native Units Network bridge works as follows:

#### L1 → L0 (Unit0 to WAVES):
1. User invokes Bridge Contract to lock UNIT0 permanently
2. Bridge Contract emits operation event
3. L0 miner posts block metadata to Chain Contract
4. Cryptographic digest applied for L1-to-L0 transfer
5. Wait ~200 L1 epochs for finality (prevents double-spending)
6. Recipient applies cryptographic proof
7. Chain Contract mints wrapped UNIT0 (WUNIT0) on WAVES

#### L0 → L1 (WAVES to Unit0):
1. User invokes Chain Contract with wrapped UNIT0
2. Chain Contract burns the wrapped token
3. Record added to state
4. L1 miner reads state, adds withdrawal data to block
5. UNIT0 available in next L1 block (~instant)

### 2.3 Known Token Addresses

| Token | Network | Address/ID |
|-------|---------|------------|
| UNIT0 | Unit Zero (L1) | `0x0000000000000000000000000000000000000000` |
| UNIT0 | Ethereum | `0x48B847cF774A5710F36f594b11fc10E2E59BbA72` |
| UNIT0 | BNB Chain | `0xBA13c087f81166d0b56f006a7a2504847Ef9DA05` |
| UNIT0 | Base | `0x03dbc70A0f4F141591E7925976f35b3bf794B18C` |
| UNIT0 | Solana | `6FTxERA8GUvmfh1FiQ5AJQETTfibAxpmieDihBWVe8xa` |
| UNIT0 | WAVES | `GjwAHMjqWzYR4LgoNy91CxUKAGJN79h2hseZoae4nU8t` |
| WAVES | WAVES | `null` (native) |

### 2.4 Node Architecture

Unit0 nodes consist of two clients:

| Component | Technology | Purpose |
|-----------|------------|---------|
| Execution Client | Hyperledger Besu | Process transactions, update state, handle JSON-RPC |
| Consensus Client | Waves node + ConsensusClient extension | Block creation, LPoS consensus |

### 2.5 RPC Endpoint

- **Mainnet**: `https://rpc.unit0.dev`
- **Supported Methods**: 34 Ethereum-compatible JSON-RPC methods
- Standard EVM tooling compatible (ethers.js, web3.js, Hardhat, etc.)

---

## 3. System Architecture

### 3.1 High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BRIDGE SYSTEM                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐                                      ┌──────────────┐     │
│  │ WAVES Chain  │                                      │ Unit0 Chain  │     │
│  │              │                                      │              │     │
│  │ ┌──────────┐ │    ┌────────────────────────────┐   │ ┌──────────┐ │     │
│  │ │  Bridge  │ │    │     VALIDATOR NETWORK      │   │ │  Bridge  │ │     │
│  │ │   dApp   │◄├───►│                            │◄──├►│ Contract │ │     │
│  │ │  (Ride)  │ │    │  ┌─────┐ ┌─────┐ ┌─────┐  │   │ │(Solidity)│ │     │
│  │ └──────────┘ │    │  │ V1  │ │ V2  │ │ V3  │  │   │ └──────────┘ │     │
│  │              │    │  └─────┘ └─────┘ └─────┘  │   │              │     │
│  │ ┌──────────┐ │    │  ┌─────┐ ┌─────┐ ┌─────┐  │   │ ┌──────────┐ │     │
│  │ │  Token   │ │    │  │ V4  │ │ V5  │ │ V6  │  │   │ │  Token   │ │     │
│  │ │ Registry │ │    │  └─────┘ └─────┘ └─────┘  │   │ │ Factory  │ │     │
│  │ └──────────┘ │    │                            │   │ └──────────┘ │     │
│  └──────────────┘    └────────────────────────────┘   └──────────────┘     │
│                                    │                                         │
│                                    ▼                                         │
│                      ┌────────────────────────┐                             │
│                      │    RELAYER NETWORK     │                             │
│                      │  (Transaction Submit)  │                             │
│                      └────────────────────────┘                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Component Responsibilities

#### 3.2.1 WAVES Bridge dApp (Ride)
- Lock native WAVES assets and tokens
- Verify validator multi-signatures
- Release assets upon valid cross-chain proof
- Manage token registry for WAVES-native assets
- Emit events for validator monitoring

#### 3.2.2 Unit0 Bridge Contract (Solidity)
- Lock ERC-20/721/1155 tokens
- Deploy wrapped token contracts
- Verify ECDSA multi-signatures from validators
- Release assets upon valid attestations
- Manage wrapped token registry

#### 3.2.3 Validator Network
- Monitor both chains for bridge events
- Reach consensus on cross-chain transfers
- Sign attestations for valid transfers
- Slash malicious validators
- Rotate validator set periodically

#### 3.2.4 Relayer Network
- Aggregate validator signatures
- Submit transactions to destination chain
- Pay gas fees (reimbursed from bridge fees)
- Retry failed transactions
- Anyone can run a relayer (permissionless)

---

## 4. Smart Contracts

### 4.1 WAVES Bridge dApp (Ride)

#### 4.1.1 Contract State

```ride
# Validator management
let validatorList = getString("validators")           # Comma-separated public keys
let validatorThreshold = getInteger("threshold")      # Required signatures (M of N)
let validatorCount = getInteger("validatorCount")     # Total validators (N)

# Token registry
let tokenMapping_{assetId} = getString(...)           # Maps WAVES asset to Unit0 address
let isWrapped_{assetId} = getBoolean(...)             # True if token originated on Unit0

# Transfer tracking
let processedTransfers_{transferId} = getBoolean(...) # Prevent replay attacks
let pendingLocks_{lockId} = getString(...)            # Pending lock details

# Nonce management
let outboundNonce = getInteger("outboundNonce")       # Incremented per outbound transfer
```

#### 4.1.2 Core Functions

```ride
# Lock assets to bridge to Unit0
@Callable(i)
func lockTokens(destinationAddress: String, destinationChainId: Int) = {
    # Validate payment attached
    # Generate unique lockId
    # Store lock details
    # Emit DataEntry for validators to observe
    # Return lockId to user
}

# Release assets from Unit0 (requires validator signatures)
@Callable(i)
func releaseTokens(
    transferId: String,
    recipient: String,
    assetId: String,
    amount: Int,
    signatures: List[String],
    signers: List[String]
) = {
    # Verify transferId not already processed
    # Verify M-of-N valid signatures
    # Transfer assets to recipient
    # Mark transfer as processed
}

# Register new token mapping (governance controlled)
@Callable(i)
func registerToken(wavesAssetId: String, unit0Address: String, isWrapped: Boolean) = {
    # Only callable by governance/validators
    # Store bidirectional mapping
}
```

#### 4.1.3 Events (Data Entries for Monitoring)

```ride
# Lock event format
"lock_{lockId}" = "{assetId}|{amount}|{sender}|{destinationAddress}|{timestamp}|{nonce}"

# Release event format
"release_{transferId}" = "{assetId}|{amount}|{recipient}|{timestamp}"
```

### 4.2 Unit0 Bridge Contract (Solidity)

#### 4.2.1 Contract Structure

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract WavesUnit0Bridge is ReentrancyGuard, Pausable {

    // ============ Structs ============

    struct Validator {
        address addr;
        uint256 stake;
        bool active;
        uint256 joinedAt;
    }

    struct LockInfo {
        address token;
        uint256 amount;
        address sender;
        string wavesDestination;
        uint256 timestamp;
        uint256 nonce;
        TokenType tokenType;
        uint256 tokenId;  // For NFTs
    }

    struct ReleaseInfo {
        bytes32 wavesTransferId;
        address token;
        uint256 amount;
        address recipient;
        TokenType tokenType;
        uint256 tokenId;
    }

    enum TokenType { ERC20, ERC721, ERC1155, NATIVE }

    // ============ State Variables ============

    mapping(address => Validator) public validators;
    address[] public validatorList;
    uint256 public validatorThreshold;

    mapping(bytes32 => bool) public processedTransfers;
    mapping(bytes32 => LockInfo) public pendingLocks;

    mapping(address => address) public unit0ToWavesToken;  // Unit0 -> WAVES mapping
    mapping(string => address) public wavesToUnit0Token;   // WAVES assetId -> Unit0
    mapping(address => bool) public isWrappedToken;        // True if originated on WAVES

    uint256 public outboundNonce;
    uint256 public bridgeFeePercent;  // In basis points (100 = 1%)

    address public wrappedTokenFactory;

    // ============ Events ============

    event TokensLocked(
        bytes32 indexed lockId,
        address indexed token,
        uint256 amount,
        address indexed sender,
        string wavesDestination,
        uint256 nonce,
        TokenType tokenType,
        uint256 tokenId
    );

    event TokensReleased(
        bytes32 indexed wavesTransferId,
        address indexed token,
        uint256 amount,
        address indexed recipient,
        TokenType tokenType,
        uint256 tokenId
    );

    event ValidatorAdded(address indexed validator, uint256 stake);
    event ValidatorRemoved(address indexed validator);
    event TokenRegistered(address indexed unit0Token, string wavesAssetId);
}
```

#### 4.2.2 Core Functions

```solidity
// Lock ERC20 tokens for bridging to WAVES
function lockERC20(
    address token,
    uint256 amount,
    string calldata wavesDestination
) external nonReentrant whenNotPaused returns (bytes32 lockId) {
    require(amount > 0, "Amount must be positive");
    require(bytes(wavesDestination).length == 35, "Invalid WAVES address");

    // Transfer tokens to bridge
    IERC20(token).transferFrom(msg.sender, address(this), amount);

    // Calculate fee
    uint256 fee = (amount * bridgeFeePercent) / 10000;
    uint256 netAmount = amount - fee;

    // Generate lock ID
    lockId = keccak256(abi.encodePacked(
        block.chainid,
        token,
        netAmount,
        msg.sender,
        wavesDestination,
        outboundNonce
    ));

    // Store lock info
    pendingLocks[lockId] = LockInfo({
        token: token,
        amount: netAmount,
        sender: msg.sender,
        wavesDestination: wavesDestination,
        timestamp: block.timestamp,
        nonce: outboundNonce,
        tokenType: TokenType.ERC20,
        tokenId: 0
    });

    outboundNonce++;

    emit TokensLocked(
        lockId,
        token,
        netAmount,
        msg.sender,
        wavesDestination,
        outboundNonce - 1,
        TokenType.ERC20,
        0
    );
}

// Release tokens from WAVES (requires validator signatures)
function releaseTokens(
    bytes32 wavesTransferId,
    address token,
    uint256 amount,
    address recipient,
    TokenType tokenType,
    uint256 tokenId,
    bytes[] calldata signatures,
    address[] calldata signers
) external nonReentrant whenNotPaused {
    require(!processedTransfers[wavesTransferId], "Already processed");
    require(signatures.length >= validatorThreshold, "Insufficient signatures");
    require(signatures.length == signers.length, "Length mismatch");

    // Verify signatures
    bytes32 messageHash = keccak256(abi.encodePacked(
        wavesTransferId,
        token,
        amount,
        recipient,
        tokenType,
        tokenId,
        block.chainid
    ));

    bytes32 ethSignedHash = keccak256(abi.encodePacked(
        "\x19Ethereum Signed Message:\n32",
        messageHash
    ));

    uint256 validSignatures = 0;
    address lastSigner = address(0);

    for (uint256 i = 0; i < signatures.length; i++) {
        address signer = recoverSigner(ethSignedHash, signatures[i]);
        require(signer > lastSigner, "Signers not sorted");  // Prevent duplicates
        require(validators[signer].active, "Invalid validator");
        lastSigner = signer;
        validSignatures++;
    }

    require(validSignatures >= validatorThreshold, "Threshold not met");

    // Mark as processed
    processedTransfers[wavesTransferId] = true;

    // Release tokens based on type
    if (tokenType == TokenType.ERC20) {
        if (isWrappedToken[token]) {
            // Mint wrapped tokens
            IWrappedToken(token).mint(recipient, amount);
        } else {
            // Transfer from bridge reserves
            IERC20(token).transfer(recipient, amount);
        }
    } else if (tokenType == TokenType.ERC721) {
        // Handle NFT release
        if (isWrappedToken[token]) {
            IWrappedNFT(token).mint(recipient, tokenId);
        } else {
            IERC721(token).transferFrom(address(this), recipient, tokenId);
        }
    }

    emit TokensReleased(wavesTransferId, token, amount, recipient, tokenType, tokenId);
}
```

### 4.3 Wrapped Token Factory (Solidity)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/proxy/Clones.sol";

contract WrappedTokenFactory {

    address public erc20Implementation;
    address public erc721Implementation;
    address public bridge;

    mapping(string => address) public wavesAssetToWrapped;

    event WrappedTokenCreated(
        string wavesAssetId,
        address wrappedToken,
        string name,
        string symbol,
        uint8 decimals
    );

    function createWrappedERC20(
        string calldata wavesAssetId,
        string calldata name,
        string calldata symbol,
        uint8 decimals
    ) external returns (address) {
        require(msg.sender == bridge, "Only bridge");
        require(wavesAssetToWrapped[wavesAssetId] == address(0), "Already exists");

        address clone = Clones.clone(erc20Implementation);
        IWrappedToken(clone).initialize(name, symbol, decimals, bridge);

        wavesAssetToWrapped[wavesAssetId] = clone;

        emit WrappedTokenCreated(wavesAssetId, clone, name, symbol, decimals);

        return clone;
    }
}
```

---

## 5. Validator Network

### 5.1 Validator Requirements

| Requirement | Specification |
|-------------|---------------|
| Minimum Stake | 100,000 UNIT0 (or equivalent) |
| Hardware | 4 CPU, 8GB RAM, 100GB SSD |
| Uptime | 99.5% minimum |
| Network | Low latency connection to both chains |

### 5.2 Consensus Mechanism

#### 5.2.1 Threshold Signature Scheme

- **M-of-N Multisig**: Requires M signatures from N total validators
- **Recommended Configuration**: 5-of-7 (71% threshold)
- **Signature Aggregation**: Validators sign independently, relayers aggregate

#### 5.2.2 Validator Selection

```
Initial Phase:
- Permissioned validator set (7 trusted parties)
- Governance-controlled additions/removals

Mature Phase:
- Stake-weighted selection
- Minimum stake requirement
- Slashing for misbehavior
- Rotation every epoch (1 week)
```

### 5.3 Validator Node Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   VALIDATOR NODE                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │    WAVES     │  │    Unit0     │  │   Message    │   │
│  │   Watcher    │  │   Watcher    │  │    Queue     │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                 │                  │           │
│         ▼                 ▼                  ▼           │
│  ┌────────────────────────────────────────────────────┐ │
│  │              EVENT PROCESSOR                        │ │
│  │  - Validate events                                  │ │
│  │  - Check confirmations                              │ │
│  │  - Verify token mappings                            │ │
│  └────────────────────────┬───────────────────────────┘ │
│                           │                              │
│                           ▼                              │
│  ┌────────────────────────────────────────────────────┐ │
│  │              SIGNATURE ENGINE                       │ │
│  │  - Sign valid transfers                             │ │
│  │  - Store in local DB                                │ │
│  │  - Broadcast to P2P network                         │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   Key Mgmt   │  │   Local DB   │  │  P2P Network │   │
│  │    (HSM)     │  │  (LevelDB)   │  │   (libp2p)   │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 5.4 Validator Node Implementation

```typescript
// validator/src/index.ts

interface TransferEvent {
  transferId: string;
  sourceChain: 'WAVES' | 'UNIT0';
  token: string;
  amount: bigint;
  sender: string;
  recipient: string;
  nonce: number;
  blockNumber: number;
  txHash: string;
}

interface SignedAttestation {
  transferId: string;
  signature: string;
  validatorAddress: string;
  timestamp: number;
}

class ValidatorNode {
  private wavesWatcher: WavesWatcher;
  private unit0Watcher: Unit0Watcher;
  private signer: Signer;
  private p2pNetwork: P2PNetwork;
  private db: LevelDB;

  async processWavesEvent(event: TransferEvent): Promise<void> {
    // 1. Wait for sufficient confirmations (10 blocks on WAVES)
    await this.waitForConfirmations(event, 10);

    // 2. Validate event data
    if (!this.validateEvent(event)) {
      this.logger.warn('Invalid event', event);
      return;
    }

    // 3. Check if already processed
    if (await this.db.get(`processed:${event.transferId}`)) {
      return;
    }

    // 4. Create attestation message
    const message = this.createAttestationMessage(event);

    // 5. Sign the message
    const signature = await this.signer.sign(message);

    // 6. Store locally
    await this.db.put(`signature:${event.transferId}`, signature);

    // 7. Broadcast to P2P network
    await this.p2pNetwork.broadcast({
      type: 'ATTESTATION',
      transferId: event.transferId,
      signature,
      validatorAddress: this.signer.address
    });
  }

  private createAttestationMessage(event: TransferEvent): string {
    return ethers.solidityPackedKeccak256(
      ['bytes32', 'address', 'uint256', 'address', 'uint8', 'uint256', 'uint256'],
      [
        event.transferId,
        event.token,
        event.amount,
        event.recipient,
        event.tokenType,
        event.tokenId,
        DESTINATION_CHAIN_ID
      ]
    );
  }
}
```

### 5.5 Slashing Conditions

| Violation | Penalty | Detection |
|-----------|---------|-----------|
| Double signing | 100% stake | On-chain proof |
| Signing invalid transfer | 50% stake | Fraud proof |
| Extended downtime (>24h) | 5% stake | Heartbeat failure |
| Censorship (not signing valid) | 10% stake | Community report |

---

## 6. Token Registry & Wrapping

### 6.1 Token Classification

```
┌─────────────────────────────────────────────────────────────┐
│                    TOKEN CLASSIFICATION                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  NATIVE TOKENS (Lock & Mint)                                │
│  ├── WAVES → Unit0: Lock on WAVES, Mint wrapped on Unit0    │
│  └── Unit0 → WAVES: Lock on Unit0, Mint wrapped on WAVES    │
│                                                              │
│  WRAPPED TOKENS (Burn & Release)                            │
│  ├── wWAVES on Unit0 → WAVES: Burn wrapped, Release native  │
│  └── wETH on WAVES → Unit0: Burn wrapped, Release native    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Token Registry Structure

#### WAVES Side (Ride Data Entries)

```ride
# Token mapping format
"token_map_{wavesAssetId}" = "{unit0Address}|{isNative}|{decimals}|{name}|{symbol}"

# Example entries
"token_map_WAVES" = "0x1234...abcd|true|8|WAVES|WAVES"
"token_map_DG2xF...xyz" = "0x5678...efgh|true|8|USDN|USDN"
"token_map_wrapped_0xABCD" = "0xABCD...1234|false|18|Wrapped ETH|wETH"
```

#### Unit0 Side (Solidity Mapping)

```solidity
struct TokenInfo {
    string wavesAssetId;
    bool isNative;          // True if originated on Unit0
    uint8 wavesDecimals;
    uint8 unit0Decimals;
    bool isActive;
}

mapping(address => TokenInfo) public tokenRegistry;
mapping(string => address) public wavesAssetToUnit0;
```

### 6.3 Decimal Handling

```
WAVES typically uses 8 decimals
Unit0/EVM typically uses 18 decimals

Conversion Formula:
- WAVES → Unit0: amount * 10^(18-8) = amount * 10^10
- Unit0 → WAVES: amount / 10^(18-8) = amount / 10^10

Special Cases:
- USDT (6 decimals on both): No conversion
- Custom tokens: Use registry decimals
```

### 6.4 NFT Registry

```solidity
struct NFTInfo {
    string wavesAssetId;
    string baseURI;
    address unit0Contract;
    bool isNative;
}

// Mapping from WAVES NFT ID to Unit0 token ID
mapping(string => mapping(string => uint256)) public wavesNFTToTokenId;
```

---

## 7. Bridge Flow

### 7.1 WAVES → Unit0 Transfer Flow

```
┌─────────┐    ┌─────────────┐    ┌────────────┐    ┌─────────────┐    ┌─────────┐
│  User   │    │ WAVES Bridge│    │ Validators │    │   Relayer   │    │  Unit0  │
│         │    │    dApp     │    │  Network   │    │   Network   │    │ Bridge  │
└────┬────┘    └──────┬──────┘    └─────┬──────┘    └──────┬──────┘    └────┬────┘
     │                │                  │                  │               │
     │  1. Lock tokens│                  │                  │               │
     │───────────────►│                  │                  │               │
     │                │                  │                  │               │
     │                │  2. Emit lock    │                  │               │
     │                │     event        │                  │               │
     │                │─────────────────►│                  │               │
     │                │                  │                  │               │
     │                │                  │ 3. Wait for      │               │
     │                │                  │    confirmations │               │
     │                │                  │    (10 blocks)   │               │
     │                │                  │                  │               │
     │                │                  │ 4. Sign          │               │
     │                │                  │    attestation   │               │
     │                │                  │─────────────────►│               │
     │                │                  │                  │               │
     │                │                  │                  │ 5. Aggregate  │
     │                │                  │                  │    signatures │
     │                │                  │                  │               │
     │                │                  │                  │ 6. Submit to  │
     │                │                  │                  │    Unit0      │
     │                │                  │                  │──────────────►│
     │                │                  │                  │               │
     │                │                  │                  │               │ 7. Verify
     │                │                  │                  │               │    sigs
     │                │                  │                  │               │
     │                │                  │                  │               │ 8. Mint/
     │                │                  │                  │               │    Release
     │◄───────────────┼──────────────────┼──────────────────┼───────────────│
     │                │                  │                  │    9. Tokens  │
     │                │                  │                  │       received│
```

### 7.2 Unit0 → WAVES Transfer Flow

```
┌─────────┐    ┌─────────────┐    ┌────────────┐    ┌─────────────┐    ┌─────────┐
│  User   │    │ Unit0 Bridge│    │ Validators │    │   Relayer   │    │  WAVES  │
│         │    │  Contract   │    │  Network   │    │   Network   │    │ Bridge  │
└────┬────┘    └──────┬──────┘    └─────┬──────┘    └──────┬──────┘    └────┬────┘
     │                │                  │                  │               │
     │  1. Lock/Burn  │                  │                  │               │
     │───────────────►│                  │                  │               │
     │                │                  │                  │               │
     │                │  2. Emit lock    │                  │               │
     │                │     event        │                  │               │
     │                │─────────────────►│                  │               │
     │                │                  │                  │               │
     │                │                  │ 3. Wait for      │               │
     │                │                  │    confirmations │               │
     │                │                  │    (32 blocks)   │               │
     │                │                  │                  │               │
     │                │                  │ 4. Sign          │               │
     │                │                  │    attestation   │               │
     │                │                  │─────────────────►│               │
     │                │                  │                  │               │
     │                │                  │                  │ 5. Aggregate  │
     │                │                  │                  │    signatures │
     │                │                  │                  │               │
     │                │                  │                  │ 6. Submit to  │
     │                │                  │                  │    WAVES      │
     │                │                  │                  │──────────────►│
     │                │                  │                  │               │
     │                │                  │                  │               │ 7. Verify
     │                │                  │                  │               │    sigs
     │                │                  │                  │               │
     │                │                  │                  │               │ 8. Mint/
     │                │                  │                  │               │    Release
     │◄───────────────┼──────────────────┼──────────────────┼───────────────│
     │                │                  │                  │    9. Tokens  │
     │                │                  │                  │       received│
```

### 7.3 Confirmation Requirements

| Chain | Blocks | Approximate Time | Rationale |
|-------|--------|------------------|-----------|
| WAVES | 10 | ~10 minutes | Standard finality |
| Unit0 | 32 | ~6 minutes (assuming 12s blocks) | EVM finality standard |

### 7.4 Transfer States

```
INITIATED    → User locked tokens on source chain
CONFIRMING   → Waiting for block confirmations
ATTESTING    → Validators signing attestations
THRESHOLD    → Sufficient signatures collected
RELAYING     → Relayer submitting to destination
COMPLETED    → Tokens released on destination
FAILED       → Transfer failed (refundable)
```

---

## 8. Security Model

### 8.1 Threat Analysis

| Threat | Impact | Likelihood | Mitigation |
|--------|--------|------------|------------|
| Validator collusion | Critical | Low | M-of-N threshold, slashing |
| Smart contract exploit | Critical | Medium | Audits, formal verification |
| Replay attacks | High | Medium | Unique transfer IDs, nonce tracking |
| Oracle manipulation | High | Low | Multiple validators, median values |
| Front-running | Medium | Medium | Commit-reveal for large transfers |
| DoS on validators | Medium | Medium | Distributed infrastructure |

### 8.2 Security Mechanisms

#### 8.2.1 Multi-Signature Validation

```
Security Property: No single validator can authorize transfers
Implementation: 5-of-7 threshold signatures
Benefit: Tolerates up to 2 malicious or offline validators
```

#### 8.2.2 Replay Protection

```solidity
// Each transfer has unique ID
bytes32 transferId = keccak256(abi.encodePacked(
    sourceChainId,
    sourceTransactionHash,
    logIndex,
    nonce
));

// Marked as processed after execution
processedTransfers[transferId] = true;
```

#### 8.2.3 Rate Limiting

```solidity
// Per-token daily limits
mapping(address => uint256) public dailyLimit;
mapping(address => uint256) public dailyTransferred;
mapping(address => uint256) public lastResetDay;

function checkLimit(address token, uint256 amount) internal {
    uint256 today = block.timestamp / 1 days;
    if (lastResetDay[token] < today) {
        dailyTransferred[token] = 0;
        lastResetDay[token] = today;
    }
    require(dailyTransferred[token] + amount <= dailyLimit[token], "Daily limit exceeded");
    dailyTransferred[token] += amount;
}
```

#### 8.2.4 Emergency Controls

```solidity
// Pausable by governance multisig
function pause() external onlyGovernance {
    _pause();
    emit BridgePaused(msg.sender, block.timestamp);
}

// Per-token pause
mapping(address => bool) public tokenPaused;

function pauseToken(address token) external onlyGovernance {
    tokenPaused[token] = true;
    emit TokenPaused(token);
}
```

### 8.3 Audit Requirements

| Phase | Audit Type | Scope |
|-------|------------|-------|
| Pre-mainnet | Smart Contract Audit | All Solidity + Ride contracts |
| Pre-mainnet | Security Assessment | Validator node implementation |
| Pre-mainnet | Formal Verification | Core transfer logic |
| Post-launch | Ongoing Bug Bounty | All components |

---

## 9. Fee Structure

### 9.1 Fee Components

| Fee Type | Amount | Recipient | Purpose |
|----------|--------|-----------|---------|
| Bridge Fee | 0.1% | Treasury | Protocol development |
| Validator Fee | 0.05% | Validators | Operational costs |
| Relayer Gas | Variable | Relayer | Transaction costs |

### 9.2 Fee Calculation

```solidity
function calculateFees(uint256 amount) public view returns (
    uint256 bridgeFee,
    uint256 validatorFee,
    uint256 netAmount
) {
    bridgeFee = (amount * bridgeFeePercent) / 10000;      // 0.1% = 10 basis points
    validatorFee = (amount * validatorFeePercent) / 10000; // 0.05% = 5 basis points
    netAmount = amount - bridgeFee - validatorFee;
}
```

### 9.3 Fee Distribution

```
┌─────────────────────────────────────────┐
│           INCOMING TRANSFER FEE          │
│              (0.15% total)               │
├─────────────────────────────────────────┤
│                                          │
│   ┌─────────────┐    ┌─────────────┐    │
│   │  Treasury   │    │ Validators  │    │
│   │    (67%)    │    │    (33%)    │    │
│   │   0.10%     │    │   0.05%     │    │
│   └─────────────┘    └─────────────┘    │
│                                          │
└─────────────────────────────────────────┘
```

---

## 10. API Specifications

### 10.1 REST API Endpoints

#### Bridge Status

```
GET /api/v1/status
Response:
{
  "wavesConnected": true,
  "unit0Connected": true,
  "activeValidators": 7,
  "validatorThreshold": 5,
  "totalLocked": {
    "waves": "1000000.00000000",
    "unit0": "500000.000000000000000000"
  }
}
```

#### Get Transfer Status

```
GET /api/v1/transfer/{transferId}
Response:
{
  "transferId": "0x1234...abcd",
  "status": "COMPLETED",
  "sourceChain": "WAVES",
  "destinationChain": "UNIT0",
  "token": "WAVES",
  "amount": "100.00000000",
  "sender": "3P...xyz",
  "recipient": "0x9876...dcba",
  "sourceTxHash": "abc123...",
  "destinationTxHash": "def456...",
  "signatures": 5,
  "requiredSignatures": 5,
  "createdAt": "2024-12-18T10:00:00Z",
  "completedAt": "2024-12-18T10:15:00Z"
}
```

#### Get Supported Tokens

```
GET /api/v1/tokens
Response:
{
  "tokens": [
    {
      "wavesAssetId": "WAVES",
      "unit0Address": "0x1234...abcd",
      "name": "WAVES",
      "symbol": "WAVES",
      "wavesDecimals": 8,
      "unit0Decimals": 18,
      "isActive": true,
      "dailyLimit": "1000000",
      "totalBridged": "5000000"
    }
  ]
}
```

#### Estimate Fees

```
POST /api/v1/estimate
Request:
{
  "sourceChain": "WAVES",
  "destinationChain": "UNIT0",
  "token": "WAVES",
  "amount": "100.00000000"
}
Response:
{
  "bridgeFee": "0.10000000",
  "validatorFee": "0.05000000",
  "estimatedGas": "0.005",
  "netAmount": "99.85000000",
  "estimatedTime": "15 minutes"
}
```

### 10.2 WebSocket Events

```typescript
// Connect to WebSocket
ws://bridge-api.example.com/ws

// Subscribe to transfer updates
{
  "type": "subscribe",
  "channel": "transfer",
  "transferId": "0x1234...abcd"
}

// Transfer status update event
{
  "type": "transfer_update",
  "transferId": "0x1234...abcd",
  "status": "ATTESTING",
  "signatures": 3,
  "requiredSignatures": 5,
  "timestamp": "2024-12-18T10:05:00Z"
}
```

### 10.3 SDK Interface

```typescript
// TypeScript SDK Usage

import { WavesUnit0Bridge } from '@waves-unit0/bridge-sdk';

const bridge = new WavesUnit0Bridge({
  wavesNodeUrl: 'https://nodes.wavesnodes.com',
  unit0RpcUrl: 'https://rpc.unit0.network',
  apiUrl: 'https://bridge-api.example.com'
});

// Bridge WAVES to Unit0
const transfer = await bridge.bridgeToUnit0({
  asset: 'WAVES',
  amount: '100',
  destinationAddress: '0x1234...abcd'
});

// Monitor transfer
transfer.on('status', (status) => {
  console.log(`Transfer status: ${status}`);
});

// Wait for completion
const result = await transfer.wait();
console.log(`Completed! Destination tx: ${result.destinationTxHash}`);
```

---

## 11. Deployment Strategy

### 11.1 Deployment Phases

```
┌─────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT PHASES                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  PHASE 1: Testnet Launch                                    │
│  ├── Deploy contracts to WAVES Testnet & Unit0 Testnet      │
│  ├── Launch 3 validator nodes (internal)                    │
│  ├── Limited token support (WAVES, test ERC20)              │
│  └── Public testing period                                  │
│                                                              │
│  PHASE 2: Audited Testnet                                   │
│  ├── Smart contract audit completion                         │
│  ├── Security assessment of validator nodes                  │
│  ├── Bug bounty program launch                               │
│  └── Extended testing with community                         │
│                                                              │
│  PHASE 3: Mainnet Beta                                      │
│  ├── Deploy to mainnets with transfer limits                │
│  ├── 5 validator nodes (3 internal, 2 partner)              │
│  ├── Whitelisted tokens only                                 │
│  └── Daily volume caps                                       │
│                                                              │
│  PHASE 4: Full Mainnet                                      │
│  ├── Remove transfer limits                                  │
│  ├── 7+ validator nodes                                      │
│  ├── Open token registration                                 │
│  └── Full public access                                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 11.2 Contract Addresses (To Be Populated)

| Contract | WAVES Testnet | WAVES Mainnet | Unit0 Testnet | Unit0 Mainnet |
|----------|---------------|---------------|---------------|---------------|
| Bridge | TBD | TBD | TBD | TBD |
| Token Factory | N/A | N/A | TBD | TBD |
| Token Registry | TBD | TBD | TBD | TBD |
| Governance | TBD | TBD | TBD | TBD |

### 11.3 Validator Onboarding

1. **Application**: Submit validator application with stake commitment
2. **KYC/AML**: Complete compliance requirements (Phase 1-2 only)
3. **Technical Setup**: Deploy validator node with required specs
4. **Stake Deposit**: Lock minimum stake in governance contract
5. **Activation**: Added to active validator set by governance

### 11.4 Monitoring & Alerting

| Metric | Warning Threshold | Critical Threshold | Action |
|--------|-------------------|-------------------|--------|
| Validator uptime | <99% | <95% | Page on-call |
| Signature latency | >30s | >60s | Investigate |
| Bridge TVL change | >10%/hour | >25%/hour | Pause bridge |
| Failed transfers | >1% | >5% | Pause bridge |
| Gas price (Unit0) | >100 gwei | >500 gwei | Delay relaying |

---

## Appendix A: Ride Contract Full Implementation

See [contracts/waves/bridge.ride](contracts/waves/bridge.ride)

## Appendix B: Solidity Contract Full Implementation

See [contracts/unit0/Bridge.sol](contracts/unit0/Bridge.sol)

## Appendix C: Validator Node Setup Guide

See [docs/validator-setup.md](docs/validator-setup.md)

## Appendix D: API Reference

See [docs/api-reference.md](docs/api-reference.md)

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2024-12-18 | Bridge Team | Initial architecture document |

---

## Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Technical Lead | | | |
| Security Lead | | | |
| Product Owner | | | |
