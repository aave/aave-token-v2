methods {
	totalSupply() returns uint256 envfree
	balanceOf(address) returns uint256 envfree
	_votingPowerSnapshotsCounts(address) returns uint256 envfree
	_propositionPowerSnapshotsCounts(address) returns uint256 envfree
	_nonces(address) returns uint256 envfree
	getLastPropositionPowerSnapshotValue(address) returns uint256 envfree
	getLastVoteSnapshotValue(address) returns uint256 envfree
	certoraHarness_getMyExtcodeSize() returns uint256 envfree
	certoraHarness_accessInitializer() returns bool envfree
	certoraHarness_getAaveGovernance() returns address envfree
	certoraHarness_getExtcodeSize(address) returns uint256 envfree
}

// this is expected to fail - it's not clear why the `initializer` field is necessary - what happens if someone by mistake sets it to true? it's never even turned off...
rule initializer_can_only_be_called_once(method f) {
	env e1;
	initialize(e1);
	
	env eF; calldataarg arg;
	f(eF,arg);
	
	// by this point, no way extcodesize is 0! (tool is nitpicky on this)
	require certoraHarness_getMyExtcodeSize() > 0;
	
	env e2;
	initialize@withrevert(e2);
	assert lastReverted, "second call to initializer must fail";
}

// this one is expected to pass
rule initializer_can_only_be_called_once_assume_initializer_is_always_false(method f) {

	// require initializer to be false
	require !certoraHarness_accessInitializer();
	
	env e1;
	initialize(e1);
	
	env eF; calldataarg arg;
	f(eF,arg);
	
	// by this point, no way extcodesize is 0! (tool is nitpicky on this)
	require certoraHarness_getMyExtcodeSize() > 0;
	
	env e2;
	initialize@withrevert(e2);
	assert lastReverted, "second call to initializer must fail";
}

rule initializing_field_always_false(method f) {
	// require initializer to be false initially
	require !certoraHarness_accessInitializer();
	
	env eF; calldataarg arg;
	f(eF,arg);
	
	// make sure it's still false!
	assert !certoraHarness_accessInitializer();
}

rule transfer_cannot_revert_if_preconds_are_met(uint256 value, address to) {
	// start by assuming the bounded supply invariant
	uint256 aaveTotalSupply = totalSupply();
	require aaveTotalSupply == 2600000000000000000000000; // 2.6M*10**18
	require value <= aaveTotalSupply;
	
	env e;
	// preconds should be met
	// 1 - balance suffices
	require balanceOf(e.msg.sender) >= value;
	// 2 - snapshot count is << 2^256 for both sender and recipient
	uint256 C = max_uint256; // 2^256-1
	require _votingPowerSnapshotsCounts(e.msg.sender) < C && _votingPowerSnapshotsCounts(to) < C;
	require _propositionPowerSnapshotsCounts(e.msg.sender) < C && _propositionPowerSnapshotsCounts(to) < C;
	// 3 - it is non payable
	require e.msg.value == 0;
	// 4 - balances are within totalSupply (important for recipient)
	require balanceOf(to) < aaveTotalSupply;
	// 4b - powers are within totalSupply
	require getLastVoteSnapshotValue(to) < aaveTotalSupply && getLastPropositionPowerSnapshotValue(to) < aaveTotalSupply;
	// 5 - sender is not 0
	require e.msg.sender != 0;
	// 6 - recipient is not 0
	require to != 0;
	// 7 - dummy governance exists
	require certoraHarness_getExtcodeSize(certoraHarness_getAaveGovernance()) > 0;
	// 8 - 0xf..f address is excluded for identifying disabled snapshots
	uint x = to; // trick for casting address to uint to mathint
	require x != 2^160-1;
	
	transfer@withrevert(e, to, value);
	assert !lastReverted;
}

rule math_is_hard {
	// 2.6M * 10^18 < 2^128-1
	assert 2600000000000000000000000 < 340282366920938463463374607431768211456-1;
}

// Inspect: why nonce not increasing? there is an add operation not written back?
rule permit_increases_nonce {
	env e;
	address owner; address spender; uint256 deadline; uint256 amount; uint8 v; bytes32 r; bytes32 s;
	
	// get previous nonce
	uint256 previousNonce = sinvoke _nonces(owner);
	// we're not reaching 2^256 anytime soon
	uint256 C = max_uint256;
	require previousNonce < C;
	
	// run permit
	sinvoke permit(e,owner,spender,amount,deadline,v,r,s);
	
	// get new nonce (must be updated since we did not revert)
	uint256 newNonce = sinvoke _nonces(owner);
	
	// nonce must progress
	//assert previousNonce == nonce;
	assert newNonce == previousNonce+1;
}

// this one is expected to fail
rule approve_must_not_revert_under_permit(address owner, address spender, uint256 amount) {
	env e;
	require e.msg.sender == owner; // sender is owner
	require e.msg.value == 0; // non payable
	require owner != 0; // implied by permit
	require spender != 0;

	approve@withrevert(e,spender, amount);
	assert !lastReverted;
}

rule increase_nonce(address owner, method f) {
	uint256 previousNonce = _nonces(owner);
	
	env e;
	calldataarg arg;
	f(e, arg);

	// get new nonce (must be updated since we did not revert)
	uint256 newNonce = _nonces(owner);
	
	// if it's the same, then f never modifies nonces
	if (f.selector != delegateByTypeBySig(address,uint8,uint256,uint256,uint8,bytes32,bytes32).selector
		&& f.selector != delegateBySig(address,uint256,uint256,uint8,bytes32,bytes32).selector
		&& f.selector != permit(address,address,uint256,uint256,uint8,bytes32,bytes32).selector) {
		assert newNonce == previousNonce;
	} else {
		// if we are on a trace that modified a nonce, then it must have increased by 1
		uint256 expectedNewNonce = previousNonce+1; // note it's allowing overflows
		assert newNonce != previousNonce => newNonce == expectedNewNonce;
	}
	assert true;
}