# Disable packed storage
perl -0777 -i -pe 's/uint128/uint256/g' contracts/token/base/GovernancePowerDelegationERC20.sol;

# Add deterministic ecrecover
perl -0777 -i -pe 's/ecrecover/this._certora_ecrecover/g' contracts/token/AaveTokenV2.sol;
perl -0777 -i -pe 's/ecrecover/this._certora_ecrecover/g' spec/harness/AaveTokenHarnessV2.sol;

perl -0777 -i -pe 's/using SafeMath for uint256;/using SafeMath for uint256 ;
mapping\(bytes32 => mapping\(uint8 => mapping\(bytes32 => mapping\(bytes32 => address\)\)\)\) public _certora_ecrecover;
/g' contracts/token/AaveTokenV2.sol;

# Make it easier to handle enums (easier to read counterexamples) - can remove later
perl -0777 -i -pe 's/DelegationType delegationType/uint8 delegationType/g' contracts/interfaces/IGovernancePowerDelegationToken.sol;
perl -0777 -i -pe 's/DelegationType delegationType/uint8 delegationType/g' contracts/token/base/GovernancePowerDelegationERC20.sol;
perl -0777 -i -pe 's/DelegationType delegationType/uint8 delegationType/g' contracts/token/AaveTokenV2.sol;
perl -0777 -i -pe 's/DelegationType delegationType/uint8 delegationType/g' spec/harness/AaveTokenHarnessV2.sol;
perl -0777 -i -pe 's/DelegationType.VOTING_POWER/0/g' contracts/token/AaveTokenV2.sol;
perl -0777 -i -pe 's/DelegationType.PROPOSITION_POWER/1/g' contracts/token/AaveTokenV2.sol;
perl -0777 -i -pe 's/DelegationType.VOTING_POWER/0/g' contracts/token/base/GovernancePowerDelegationERC20.sol;
perl -0777 -i -pe 's/DelegationType.PROPOSITION_POWER/1/g' contracts/token/base/GovernancePowerDelegationERC20.sol;
