pragma solidity ^0.7.5;

import {ITransferHook} from "contracts/interfaces/ITransferHook.sol";

contract DummyGovernance {
    function onTransfer(address from, address to, uint256 amount) external {}
}