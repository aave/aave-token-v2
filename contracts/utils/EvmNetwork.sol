// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.7.5;

/**
 * @title EvmNetwork
 * @dev Provide EVM network properties
 */
contract EvmNetwork {
  function getBlockNumber() public view returns (uint256) {
    return block.number;
  }
}
