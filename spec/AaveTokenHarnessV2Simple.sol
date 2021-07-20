
pragma solidity 0.7.5;

import "contracts/token/AaveTokenV2Simple.sol";

contract AaveTokenHarnessV2Simple is AaveTokenV2Simple {
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
        return _votingSnapshots[user][_votingSnapshotsCounts[user]-1].blockNumber;
    }

    function getLastVoteSnapshotValue(address user) public view returns (uint256) {
        return _votingSnapshots[user][_votingSnapshotsCounts[user]-1].value;
    }

    function getLastPropositionPowerSnapshotBlockNumber(address user) public view returns (uint256) {
        return _propositionPowerSnapshots[user][_propositionPowerSnapshotsCounts[user]-1].blockNumber;
    }

    function getLastPropositionPowerSnapshotValue(address user) public view returns (uint256) {
        return _propositionPowerSnapshots[user][_propositionPowerSnapshotsCounts[user]-1].value;
    }

    function getFirstVoteSnapshotBlockNumber(address user) public view returns (uint256) {
        return _votingSnapshots[user][0].blockNumber;
    }

    function getFirstPropositionPowerSnapshotBlockNumber(address user) public view returns (uint256) {
        return _propositionPowerSnapshots[user][0].blockNumber;
    }

    // TODO: why are these internal in the base contract?
    function getPropositionPowerSnapshotCount(address user) public view returns (uint256) {
        return _propositionPowerSnapshotsCounts[user];
    }

    function init_state() external {}
}
	
