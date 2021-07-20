methods {
	certoraHarness_LEND_balanceOf(address) returns uint256 envfree
	certoraHarness_AAVE_balanceOf(address) returns uint256 envfree
	certoraHarness_getMyExtcodeSize() returns uint256 envfree
	certoraHarness_accessInitializer() returns bool envfree	
	LEND_AAVE_RATIO() returns uint256 envfree
}

rule both_change_in_migrate(uint256 amount) {
	env e;
	uint256 _lendBal = sinvoke certoraHarness_LEND_balanceOf(e.msg.sender);
	uint256 _aaveBal = sinvoke certoraHarness_AAVE_balanceOf(e.msg.sender);
	
	sinvoke migrateFromLEND(e,amount);
	
	uint256 lendBal_ = sinvoke certoraHarness_LEND_balanceOf(e.msg.sender);
	uint256 aaveBal_ = sinvoke certoraHarness_AAVE_balanceOf(e.msg.sender);
	if (_lendBal != lendBal_ || _aaveBal != aaveBal_) {
		assert _lendBal > lendBal_, "LEND balance should decrease";
		assert _aaveBal < aaveBal_, "AAVE balance should increase";
	}
	// it's ok if both do not change
	assert true;
}

rule both_change_in_migrate_fixed(uint256 amount) {
	env e;
	uint256 _lendBal = sinvoke certoraHarness_LEND_balanceOf(e.msg.sender);
	uint256 _aaveBal = sinvoke certoraHarness_AAVE_balanceOf(e.msg.sender);
	
	sinvoke migrateFromLEND_certora(e,amount);
	
	uint256 lendBal_ = sinvoke certoraHarness_LEND_balanceOf(e.msg.sender);
	uint256 aaveBal_ = sinvoke certoraHarness_AAVE_balanceOf(e.msg.sender);
	if (_lendBal != lendBal_ || _aaveBal != aaveBal_) {
		assert _lendBal > lendBal_, "LEND balance should decrease";
		assert _aaveBal < aaveBal_, "AAVE balance should increase";
	}
	// it's ok if both do not change
	assert true;
}

// expected to fail on migrateFromLEND and succeed on migrateFromLEND_certora
rule money_preservation(method f) {
	uint256 RATIO = sinvoke LEND_AAVE_RATIO();
	require RATIO >= 1; // looks reasonable. it's actually 1000
	
	uint256 _migrateLendBalance = sinvoke certoraHarness_LEND_balanceOf(currentContract);
	uint256 _migrateAaveBalance = sinvoke certoraHarness_AAVE_balanceOf(currentContract);
	
	uint256 _normalizedSum = _migrateLendBalance + RATIO*_migrateAaveBalance;
	
	env eF; calldataarg arg;
	sinvoke f(eF, arg);
	
	uint256 migrateLendBalance_ = sinvoke certoraHarness_LEND_balanceOf(currentContract);
	uint256 migrateAaveBalance_ = sinvoke certoraHarness_AAVE_balanceOf(currentContract);

	uint256 normalizedSum_ = migrateLendBalance_ + RATIO*migrateAaveBalance_;
	
	assert _normalizedSum == normalizedSum_;
}

// Init related rules

// this is expected to fail - it's not clear why the `initializer` field is necessary - what happens if someone by mistake sets it to true? it's never even turned off...
rule initializer_can_only_be_called_once(method f) {

	env e1;
	sinvoke initialize(e1);
	
	env eF; calldataarg arg;
	sinvoke f(eF,arg);
	
	// by this point, no way extcodesize is 0! (tool is nitpicky on this)
	require sinvoke certoraHarness_getMyExtcodeSize() > 0;
	
	env e2;
	invoke initialize(e2);
	assert lastReverted, "second call to initializer must fail";
}

// this one is expected to pass
rule initializer_can_only_be_called_once_assume_initializer_is_always_false(method f) {

	// require initializer to be false
	require !sinvoke certoraHarness_accessInitializer();
	
	env e1;
	sinvoke initialize(e1);
	
	env eF; calldataarg arg;
	sinvoke f(eF,arg);
	
	// by this point, no way extcodesize is 0! (tool is nitpicky on this)
	require sinvoke certoraHarness_getMyExtcodeSize() > 0;
	
	env e2;
	invoke initialize(e2);
	assert lastReverted, "second call to initializer must fail";
}

rule initializing_field_always_false(method f) {
	// require initializer to be false initially
	require !sinvoke certoraHarness_accessInitializer();
	
	env eF; calldataarg arg;
	sinvoke f(eF,arg);
	
	// make sure it's still false!
	assert !sinvoke certoraHarness_accessInitializer();
}