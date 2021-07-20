
pragma solidity 0.7.5;

import "contracts/token/AaveTokenV2.sol";
import {SafeMath} from 'contracts/open-zeppelin/SafeMath.sol';

contract AaveTokenHarnessV2 is AaveTokenV2 {
    using SafeMath for uint256;


    function certoraHarness_getMyExtcodeSize() external view returns (uint256) {
      // extcodesize checks the size of the code stored in an address, and
      // address returns the current address. Since the code is still not
      // deployed when running a constructor, any checks on its code size will
      // yield zero, making it an effective way to detect if a contract is
      // under construction or not.
      address self = address(this);
      uint256 cs;
      assembly { cs := extcodesize(self) }
      return cs;
    }
    
    function certoraHarness_getExtcodeSize(address x) external view returns (uint256) {
        uint256 cs;
        assembly { cs := extcodesize(x) }
        return cs;
    }
    
    function certoraHarness_accessInitializer() external view returns (bool) {
        uint256 initializerValue;
        assembly { initializerValue := sload(0x7) }
        return initializerValue > 0;
    }
    
    function certoraHarness_getAaveGovernance() public view returns (address) {
        return address(_aaveGovernance);
    }

    function getLastVoteSnapshotBlockNumber(address user) public view returns (uint256) {
        return _votingPowerSnapshots[user][_votingPowerSnapshotsCounts[user].sub(1)].blockNumber;
    }

    function getLastVoteSnapshotValue(address user) public view returns (uint256) {
        return _votingPowerSnapshots[user][_votingPowerSnapshotsCounts[user].sub(1)].value;
    }

    function getLastPropositionPowerSnapshotBlockNumber(address user) public view returns (uint256) {
        return _propositionPowerSnapshots[user][_propositionPowerSnapshotsCounts[user].sub(1)].blockNumber;
    }

    function getLastPropositionPowerSnapshotValue(address user) public view returns (uint256) {
        return _propositionPowerSnapshots[user][_propositionPowerSnapshotsCounts[user].sub(1)].value;
    }

    function getFirstVoteSnapshotBlockNumber(address user) public view returns (uint256) {
        return _votingPowerSnapshots[user][0].blockNumber;
    }

    function getFirstPropositionPowerSnapshotBlockNumber(address user) public view returns (uint256) {
        return _propositionPowerSnapshots[user][0].blockNumber;
    }

    // TODO: why are these internal in the base contract?
    function getPropositionPowerSnapshotCount(address user) public view returns (uint256) {
        return _propositionPowerSnapshotsCounts[user];
    }

    function getRawDelegateeByType(address delegator, DelegationType delegationType)
        external
        view
        returns (address)
    {
        (, , mapping(address => address) storage delegates) = _getDelegationDataByType(delegationType);

        return delegates[delegator];
    }
    
    function callEcrecover(
        address delegatee,
        uint256 nonce,
        uint256 expiry,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public returns (address) {
        bytes32 structHash = keccak256(abi.encode(DELEGATE_TYPEHASH, delegatee, nonce, expiry));
        bytes32 digest = keccak256(abi.encodePacked('\x19\x01', DOMAIN_SEPARATOR, structHash));
        address signatory = ecrecover(digest, v, r, s);
        return signatory;
    }
}
	
