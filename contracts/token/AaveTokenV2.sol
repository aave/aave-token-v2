// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.7.5;

import {ERC20} from '../open-zeppelin/ERC20.sol';
import {ITransferHook} from '../interfaces/ITransferHook.sol';
import {VersionedInitializable} from '../utils/VersionedInitializable.sol';
import {GovernancePowerDelegationERC20} from './base/GovernancePowerDelegationERC20.sol';
import {SafeMath} from '../open-zeppelin/SafeMath.sol';

/**
 * @notice implementation of the AAVE token contract
 * @author Aave
 */
contract AaveTokenV2 is GovernancePowerDelegationERC20, VersionedInitializable {
  using SafeMath for uint256;

  string internal constant NAME = 'Aave Token';
  string internal constant SYMBOL = 'AAVE';
  uint8 internal constant DECIMALS = 18;

  uint256 public constant REVISION = 3;

  /// @dev owner => next valid nonce to submit with permit()
  mapping(address => uint256) public _nonces;

  mapping(address => mapping(uint256 => Snapshot)) public _votingSnapshots;

  mapping(address => uint256) public _votingSnapshotsCounts;

  /// @dev reference to the Aave governance contract to call (if initialized) on _beforeTokenTransfer
  /// !!! IMPORTANT The Aave governance is considered a trustable contract, being its responsibility
  /// to control all potential reentrancies by calling back the AaveToken
  ITransferHook public _aaveGovernance;

  bytes32 public DOMAIN_SEPARATOR;
  bytes public constant EIP712_REVISION = bytes('1');
  bytes32 internal constant EIP712_DOMAIN = keccak256(
    'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
  );
  bytes32 public constant PERMIT_TYPEHASH = keccak256(
    'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)'
  );

  mapping(address => address) internal _votingDelegates;

  mapping(address => mapping(uint256 => Snapshot)) internal _propositionPowerSnapshots;
  mapping(address => uint256) internal _propositionPowerSnapshotsCounts;

  mapping(address => address) internal _propositionPowerDelegates;

  constructor() public ERC20(NAME, SYMBOL) {}

  /**
   * @dev initializes the contract upon assignment to the InitializableAdminUpgradeabilityProxy
   */
  function initialize() external initializer {}

  /**
   * @dev implements the permit function as for https://github.com/ethereum/EIPs/blob/8a34d644aacf0f9f8f00815307fd7dd5da07655f/EIPS/eip-2612.md
   * @param owner the owner of the funds
   * @param spender the spender
   * @param value the amount
   * @param deadline the deadline timestamp, type(uint256).max for no deadline
   * @param v signature param
   * @param s signature param
   * @param r signature param
   */

  function permit(
    address owner,
    address spender,
    uint256 value,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
  ) external {
    require(owner != address(0), 'INVALID_OWNER');
    //solium-disable-next-line
    require(block.timestamp <= deadline, 'INVALID_EXPIRATION');
    uint256 currentValidNonce = _nonces[owner];
    bytes32 digest = keccak256(
      abi.encodePacked(
        '\x19\x01',
        DOMAIN_SEPARATOR,
        keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, currentValidNonce, deadline))
      )
    );

    require(owner == ecrecover(digest, v, r, s), 'INVALID_SIGNATURE');
    _nonces[owner] = currentValidNonce.add(1);
    _approve(owner, spender, value);
  }

  /**
   * @dev returns the revision of the implementation contract
   */
  function getRevision() internal override pure returns (uint256) {
    return REVISION;
  }

  /**
   * @dev Writes a snapshot before any operation involving transfer of value: _transfer, _mint and _burn
   * - On _transfer, it writes snapshots to to and/or from, if one chose to participate in governance***
   * - On _mint, only for _to
   * - On _burn, only for _from
   * *** participating in governance is acted by delegated power to oneself or someone else
   * *** not participating in governance is default behavior (delegating to zero)
   * *** to stop pariticpating in governance and toggle off snapshot, delegate to 0x00
   * @param from the from address
   * @param to the to address
   * @param amount the amount to transfer
   */
  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 amount
  ) internal override {
    require(to != address(type(uint256).max), 'ILLEGAL_TRANSFER');
    address votingFromDelegatee = _getDelegatee(from, _votingDelegates);
    address votingToDelegatee = _getDelegatee(to, _votingDelegates);
    if (votingFromDelegatee != votingToDelegatee) {
      if (votingFromDelegatee != address(type(uint256).max)) {
        bool tokenTransfersToGo = votingFromDelegatee == from;
        _moveOutDelegatesByType(
          votingFromDelegatee,
          amount,
          DelegationType.VOTING_POWER,
          tokenTransfersToGo
        );
      }
      if (votingToDelegatee != address(type(uint256).max)) {
        bool tokenTransferToCome = votingToDelegatee == to;
        _moveInDelegatesByType(
          votingToDelegatee,
          amount,
          DelegationType.VOTING_POWER,
          tokenTransferToCome
        );
      }
    }
    address propPowerFromDelegatee = _getDelegatee(from, _propositionPowerDelegates);
    address propPowerToDelegatee = _getDelegatee(to, _propositionPowerDelegates);
    if (propPowerFromDelegatee != propPowerToDelegatee) {
      if (propPowerFromDelegatee != address(type(uint256).max)) {
        bool tokenTransfersToGo = propPowerFromDelegatee == from;
        _moveOutDelegatesByType(
          propPowerFromDelegatee,
          amount,
          DelegationType.PROPOSITION_POWER,
          tokenTransfersToGo
        );
      }
      if (propPowerToDelegatee != address(type(uint256).max)) {
        bool tokenTransferToCome = propPowerToDelegatee == to;
        _moveInDelegatesByType(
          propPowerToDelegatee,
          amount,
          DelegationType.PROPOSITION_POWER,
          tokenTransferToCome
        );
      }
    }
    // caching the aave governance address to avoid multiple state loads
    ITransferHook aaveGovernance = _aaveGovernance;
    if (aaveGovernance != ITransferHook(0)) {
      aaveGovernance.onTransfer(from, to, amount);
    }
  }

  function _getDelegationDataByType(DelegationType delegationType)
    internal
    override
    view
    returns (
      mapping(address => mapping(uint256 => Snapshot)) storage, //snapshots
      mapping(address => uint256) storage, //snapshots count
      mapping(address => address) storage //delegatees list
    )
  {
    if (delegationType == DelegationType.VOTING_POWER) {
      return (_votingSnapshots, _votingSnapshotsCounts, _votingDelegates);
    } else {
      return (
        _propositionPowerSnapshots,
        _propositionPowerSnapshotsCounts,
        _propositionPowerDelegates
      );
    }
  }

  /**
   * @dev Delegates power from signatory to `delegatee`
   * @param delegatee The address to delegate votes to
   * @param delegationType the type of delegation (VOTING_POWER, PROPOSITION_POWER)
   * @param nonce The contract state required to match the signature
   * @param expiry The time at which to expire the signature
   * @param v The recovery byte of the signature
   * @param r Half of the ECDSA signature pair
   * @param s Half of the ECDSA signature pair
   */
  function delegateByTypeBySig(
    address delegatee,
    DelegationType delegationType,
    uint256 nonce,
    uint256 expiry,
    uint8 v,
    bytes32 r,
    bytes32 s
  ) public {
    bytes32 structHash = keccak256(
      abi.encode(DELEGATE_BY_TYPE_TYPEHASH, delegatee, uint256(delegationType), nonce, expiry)
    );
    bytes32 digest = keccak256(abi.encodePacked('\x19\x01', DOMAIN_SEPARATOR, structHash));
    address signatory = ecrecover(digest, v, r, s);
    require(signatory != address(0), 'INVALID_SIGNATURE');
    require(nonce == _nonces[signatory]++, 'INVALID_NONCE');
    require(block.timestamp <= expiry, 'INVALID_EXPIRATION');
    _delegateByType(signatory, delegatee, delegationType);
  }

  /**
   * @dev Delegates power from signatory to `delegatee`
   * @param delegatee The address to delegate votes to
   * @param nonce The contract state required to match the signature
   * @param expiry The time at which to expire the signature
   * @param v The recovery byte of the signature
   * @param r Half of the ECDSA signature pair
   * @param s Half of the ECDSA signature pair
   */
  function delegateBySig(
    address delegatee,
    uint256 nonce,
    uint256 expiry,
    uint8 v,
    bytes32 r,
    bytes32 s
  ) public {
    bytes32 structHash = keccak256(abi.encode(DELEGATE_TYPEHASH, delegatee, nonce, expiry));
    bytes32 digest = keccak256(abi.encodePacked('\x19\x01', DOMAIN_SEPARATOR, structHash));
    address signatory = ecrecover(digest, v, r, s);
    require(signatory != address(0), 'INVALID_SIGNATURE');
    require(nonce == _nonces[signatory]++, 'INVALID_NONCE');
    require(block.timestamp <= expiry, 'INVALID_EXPIRATION');
    _delegateByType(signatory, delegatee, DelegationType.VOTING_POWER);
    _delegateByType(signatory, delegatee, DelegationType.PROPOSITION_POWER);
  }

  /**
   * @dev moves delegated power from one user. Call when delegating power or tranfering tokens.
   * @param from the user from which delegated power is moved
   * @param amount the amount of delegated power to be moved
   * @param delegationType the type of delegation (VOTING_POWER, PROPOSITION_POWER)
   * @param tokenTransfersToGo true if tokens will be sent from this address at the same time
   **/
  function _moveOutDelegatesByType(
    address from,
    uint256 amount,
    DelegationType delegationType,
    bool tokenTransfersToGo
  ) internal {
    (
      mapping(address => mapping(uint256 => Snapshot)) storage snapshots,
      mapping(address => uint256) storage snapshotsCounts,
      mapping(address => address) storage delegates
    ) = _getDelegationDataByType(delegationType);

    // fromDelegate can be
    // - 0x00: snapshott off asap
    // - 0xFF: snapshot off
    // - itself or other: snapshot on until chose to reset to 0x00
    address fromDelegatee = delegates[from];
    uint256 previousPower = snapshotsCounts[from] != 0
      ? snapshots[from][snapshotsCounts[from] - 1].value
      : balanceOf(from);

    if (!tokenTransfersToGo && fromDelegatee == address(type(uint256).max) && amount > 0) {
      delegates[from] = address(0);
      fromDelegatee = from;
    } else if (
      tokenTransfersToGo && previousPower == balanceOf(from) && fromDelegatee == address(0)
    ) {
      delegates[from] = address(type(uint256).max);
      snapshotsCounts[from] = 0;
      fromDelegatee = address(type(uint256).max);
    } else if (
      !tokenTransfersToGo &&
      previousPower.sub(amount) == balanceOf(from) &&
      fromDelegatee == address(0) &&
      amount > 0
    ) {
      delegates[from] = address(type(uint256).max);
      snapshotsCounts[from] = 0;
      fromDelegatee = address(type(uint256).max);
    }
    if (fromDelegatee != address(type(uint256).max)) {
      _writeSnapshot(
        snapshots,
        snapshotsCounts,
        from,
        uint128(previousPower),
        uint128(previousPower.sub(amount))
      );
      emit DelegatedPowerChanged(from, previousPower.sub(amount), delegationType);
    }
  }

  /**
   * @dev moves delegated power to a user. Call when delegating power or tranfering tokens.
   * @param to the user that will receive the delegated power
   * @param amount the amount of delegated power to be moved
   * @param delegationType the type of delegation (VOTING_POWER, PROPOSITION_POWER)
   * @param tokenTransferToCome true if tokens will be received from this address at the same time
   **/
  function _moveInDelegatesByType(
    address to,
    uint256 amount,
    DelegationType delegationType,
    bool tokenTransferToCome
  ) internal {
    (
      mapping(address => mapping(uint256 => Snapshot)) storage snapshots,
      mapping(address => uint256) storage snapshotsCounts,
      mapping(address => address) storage delegates
    ) = _getDelegationDataByType(delegationType);

    // toDelegatee can be
    // - 0x00: snapshott off asap
    // - 0xFF: snapshot off
    // - itself or other: snapshot on until chose to reset to 0x00
    address toDelegatee = delegates[to];
    uint256 previousBalance = snapshotsCounts[to] != 0
      ? snapshots[to][snapshotsCounts[to] - 1].value
      : balanceOf(to);

    // enable snapshot if receiving power
    if (!tokenTransferToCome && toDelegatee == address(type(uint256).max) && amount > 0) {
      delegates[to] = address(0);
      toDelegatee = to;
    } else if (
      tokenTransferToCome && previousBalance == balanceOf(to) && toDelegatee == address(0)
    ) {
      delegates[to] = address(type(uint256).max);
      snapshotsCounts[to] = 0;
      toDelegatee = address(type(uint256).max);
    } else if (
      !tokenTransferToCome &&
      previousBalance.add(amount) == balanceOf(to) &&
      toDelegatee == address(0) &&
      amount > 0
    ) {
      snapshotsCounts[to] = 0;
      delegates[to] = address(type(uint256).max);
      toDelegatee = address(type(uint256).max);
    }
    if (toDelegatee != address(type(uint256).max)) {
      _writeSnapshot(
        snapshots,
        snapshotsCounts,
        to,
        uint128(previousBalance),
        uint128(previousBalance.add(amount))
      );
      emit DelegatedPowerChanged(to, previousBalance.add(amount), delegationType);
    }
  }

  /**
   * @dev returns the user delegatee. If a user never performed any delegation,
   * his delegated address will be 0x0. In that case we simply return the user itself
   * If a user is out of governance, will return 0xFF
   * @param delegator the address of the user for which return the delegatee
   * @param delegates the array of delegates for a particular type of delegation
   **/
  function _getDelegatee(address delegator, mapping(address => address) storage delegates)
    internal
    override
    view
    returns (address)
  {
    address previousDelegatee = delegates[delegator];

    if (previousDelegatee == address(0)) {
      return delegator;
    }

    return previousDelegatee;
  }

  /**
   * @dev delegates the specific power to a delegatee. Function used to opt in/out of governance***
   * @param delegatee the user which delegated power has changed
   * @param delegationType the type of delegation (VOTING_POWER, PROPOSITION_POWER)
   * *** participating in governance is acted by delegated power to oneself or someone else
   * *** not participating in governance is default behavior (delegating to zero)
   * *** to stop pariticpating in governance and toggle off snapshot, delegate to 0x00
   * *** Opting out means reduced cost in token transfers
   **/
  function _delegateByType(
    address delegator,
    address delegatee,
    DelegationType delegationType
  ) internal override {
    require(delegatee != address(type(uint256).max), 'INVALID_DELEGATEE');

    (, , mapping(address => address) storage delegates) = _getDelegationDataByType(delegationType);

    uint256 delegatorBalance = balanceOf(delegator);
    address previousDelegatee = _getDelegatee(delegator, delegates);

    if (previousDelegatee == address(type(uint256).max)) {
      previousDelegatee = delegator;
    }

    _moveOutDelegatesByType(previousDelegatee, delegatorBalance, delegationType, false);

    if (delegatee == address(0)) {
      // if delegatee = 0x00, it means delegator wants snapshot off asap
      delegates[delegator] = address(0);
      _moveInDelegatesByType(delegator, delegatorBalance, delegationType, false);
    } else {
      _moveInDelegatesByType(delegatee, delegatorBalance, delegationType, false);
      delegates[delegator] = delegatee;
    }

    emit DelegateChanged(delegator, delegatee, delegationType);
  }

  function isSnapshotted(address user, DelegationType delegationType) external view returns (bool) {
    (, , mapping(address => address) storage delegates) = _getDelegationDataByType(delegationType);
    return delegates[user] != address(type(uint256).max);
  }

  /**
   * @dev returns the delegated power of a user at a certain block
   * @param user the user
   **/
  function getPowerAtBlock(
    address user,
    uint256 blockNumber,
    DelegationType delegationType
  ) external override view returns (uint256) {
    (
      mapping(address => mapping(uint256 => Snapshot)) storage snapshots,
      mapping(address => uint256) storage snapshotsCounts,
      mapping(address => address) storage delegates
    ) = _getDelegationDataByType(delegationType);
    if (
      delegates[user] == address(type(uint256).max) || snapshots[user][0].blockNumber > blockNumber
    ) {
      return 0;
    }

    return _searchByBlockNumber(snapshots, snapshotsCounts, user, blockNumber);
  }

  function getPowerCurrent(address user, DelegationType delegationType)
    external
    override
    view
    returns (uint256)
  {
    (
      mapping(address => mapping(uint256 => Snapshot)) storage snapshots,
      mapping(address => uint256) storage snapshotsCounts,
      mapping(address => address) storage delegates
    ) = _getDelegationDataByType(delegationType);

    if (delegates[user] == address(type(uint256).max)) {
      return 0;
    }

    return _searchByBlockNumber(snapshots, snapshotsCounts, user, block.number);
  }
}
