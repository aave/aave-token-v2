  
pragma solidity 0.6.10;

import "contracts/token/LendToAaveMigrator.sol";

contract MigratorHarness is LendToAaveMigrator {	
	    
	constructor(IERC20 aave, IERC20 lend, uint256 lendAaveRatio) public LendToAaveMigrator(aave, lend, lendAaveRatio) {}
	
    function migrateFromLEND_certora(uint256 amount) external {
        require(lastInitializedRevision != 0, "MIGRATION_NOT_STARTED");

        uint aaveAmount = amount.div(LEND_AAVE_RATIO);
        uint lendAmount = aaveAmount.mul(LEND_AAVE_RATIO);
        
        _totalLendMigrated = _totalLendMigrated.add(lendAmount);
        LEND.transferFrom(msg.sender, address(this), lendAmount);
        AAVE.transfer(msg.sender, aaveAmount);
        emit LendMigrated(msg.sender, lendAmount);
    }
	
	  
    // HARNESSES
    function certoraHarness_LEND_balanceOf(address x) external view returns (uint256) {
        return LEND.balanceOf(x);
    }
    
    function certoraHarness_AAVE_balanceOf(address x) external view returns (uint256) {
        return AAVE.balanceOf(x);
    }
    
    // HARNESSES for init
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
    
    function certoraHarness_accessInitializer() external view returns (bool) {
        uint256 initializerValue;
        assembly { initializerValue := sload(0x1) }
        return initializerValue > 0;
    }
}