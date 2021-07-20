methods {
	delegateByType(address,uint8)
	delegate(address)
	getDelegateeByType(address,uint8) returns address envfree
	getPowerCurrent(address,uint8) returns uint256
	getPowerAtBlock(address,uint256,uint8) returns uint256
	totalSupplyAt(uint256) returns uint256
	balanceOf(address) returns uint256 envfree
	
	_votingPowerSnapshotsCounts(address) returns uint256 envfree
	_propositionPowerSnapshotsCounts(address) returns uint256 envfree
	
	// harnesses
	getLastVoteSnapshotBlockNumber(address) returns uint256 envfree
	getLastVoteSnapshotValue(address) returns uint256 envfree
	getLastPropositionPowerSnapshotBlockNumber(address) returns uint256 envfree
	getLastPropositionPowerSnapshotValue(address) returns uint256 envfree
	getFirstVoteSnapshotBlockNumber(address) returns uint256 envfree
	getFirstPropositionPowerSnapshotBlockNumber(address) returns uint256 envfree
	
	getRawDelegateeByType(address,uint8) returns address envfree
	callEcrecover(address,uint,uint,uint8,bytes32,bytes32) returns address envfree
}

//ghost totalPowerVoting(uint256) returns uint256;

// 127 bits allow us to add two numbers and get something within 128 bits.
definition MAX_UINT127() returns uint = (max_uint128 + 1) / 2 - 1;
definition canAddWithoutOverflow128(uint256 a) returns bool = a <= MAX_UINT127();
definition validBalance(address x) returns bool = canAddWithoutOverflow128(balanceOf(x));
definition isUint128(uint256 t) returns bool = t <= max_uint128;
definition maxSnpashotCount() returns mathint = max_uint - 10;
definition isDelegateSelector(uint256 s) returns bool = s == delegate(address).selector || s == delegateByType(address,uint8).selector || s == delegateByTypeBySig(address,uint8,uint256,uint256,uint8,bytes32,bytes32).selector || s == delegateBySig(address,uint256,uint256,uint8,bytes32,bytes32).selector;

definition VOTING_POWER() returns uint8 = 0;
definition PROPOSITION_POWER() returns uint8 = 1;

definition getLastSnapshotBlockNumber(address user, uint8 type) returns uint256 =
	type == VOTING_POWER() ? getLastVoteSnapshotBlockNumber(user) : getLastPropositionPowerSnapshotBlockNumber(user);
definition getLastSnapshotValue(address user, uint8 type) returns uint256 =
	type == VOTING_POWER() ? getLastVoteSnapshotValue(user) : getLastPropositionPowerSnapshotValue(user);
definition getSnapshotCount(address user, uint8 type) returns uint256 =
	type == VOTING_POWER() ? _votingPowerSnapshotsCounts(user) : _propositionPowerSnapshotsCounts(user);

function ensureValidBalances(address x, uint8 type) {
	require validBalance(x);
	//address delegatee1 = getDelegateeByType(x, VOTING_POWER());
	//address delegatee2 = getDelegateeByType(x, PROPOSITION_POWER());
}

function ensureValidBlockNumber(uint256 time) {
	require isUint128(time);
}

/*  
 * Checks valid stored snapshots (if there are any)
 * - latest snapshot's blockNumber is always less than or equal to current block number
 * - monotonicity with respect to first snapshot (0)
 * - snapshot's values is at least the user's current balance
 */
function ensureValidStoredSnapshots(address who, uint256 now, uint8 type) {
	if (type == VOTING_POWER()) {
		uint256 voteSnapshotCount = _votingPowerSnapshotsCounts(who);
		if (voteSnapshotCount > 0) {
			uint256 lastVoteBlockNumber = getLastVoteSnapshotBlockNumber(who);
			require lastVoteBlockNumber <= now;
			require getFirstVoteSnapshotBlockNumber(who) <= lastVoteBlockNumber;
			uint256 lastVoteValue = getLastVoteSnapshotValue(who);
			require getRawDelegateeByType(who, VOTING_POWER()) == 0 => lastVoteValue >= balanceOf(who);
			require lastVoteValue <= MAX_UINT127();
			require voteSnapshotCount < maxSnpashotCount(); // or we overflow
		}
	} else if (type == PROPOSITION_POWER()) {
		uint256 propSnapshotCount = _propositionPowerSnapshotsCounts(who);
		if (propSnapshotCount > 0) {
			uint256 lastPropBlockNumber = getLastPropositionPowerSnapshotBlockNumber(who);
			require lastPropBlockNumber <= now;
			require getFirstPropositionPowerSnapshotBlockNumber(who) <= lastPropBlockNumber;
			uint256 lastPropValue = getLastPropositionPowerSnapshotValue(who);
			require getRawDelegateeByType(who, PROPOSITION_POWER()) == 0 =>  lastPropValue >= balanceOf(who);
			require lastPropValue <= MAX_UINT127();
			require propSnapshotCount < maxSnpashotCount(); // or we overflow
		}
	}
}

// status: passed
/////// SNAPSHOT RELATED
// support ensureValidStoredSnapshots (not including the part that last snapshot value is at least delegator's balance)
rule valid_written_block_number_in_snapshot(address user, method f, uint8 type) filtered { f -> !f.isView } {
	require user != 0; // not interesting case, necessary to pass
	env eF;
	uint256 now = eF.block.number;
	require isUint128(now);
	
	uint256 _lastBlockNumber = getLastSnapshotBlockNumber(user, type);
	uint256 _lastValue= getLastSnapshotValue(user, type);
	require isUint128(_lastBlockNumber) && isUint128(_lastValue);
	
	require _lastBlockNumber <= now;
	
	calldataarg arg;
	f(eF, arg);

	uint256 lastBlockNumber_ = getLastSnapshotBlockNumber(user, type);

	assert lastBlockNumber_ <= now,
			"cannot set snapshot in the future";
	assert lastBlockNumber_ >= _lastBlockNumber,
		"cannot set snapshot before other snapshots";
}

/////// DELEGATION RELATED
rule basic_reversibility_of_delegate(address delegator, address delegatee, uint8 type) {
	// Potential issue: delegatee==0 - will underflow snapshot value
	require delegatee != 0;
	
	// due to packing, balance must fit in 128 bits
	call ensureValidBalances(delegator, type);
	call ensureValidBalances(delegatee, type);

	// start with no delegatee
	require getRawDelegateeByType(delegator, type) == 0;
	
	// delegate
	env e;
	require e.msg.sender == delegator;
	call ensureValidStoredSnapshots(delegator, e.block.number, type);
	call ensureValidStoredSnapshots(delegatee, e.block.number, type);
	sinvoke delegateByType(e, delegatee, type);
	
	// try to undelegate
	env e2;
	require e2.msg.sender == delegator;
	require e2.msg.value == 0;
	require e2.block.number >= e.block.number && e2.block.timestamp >= e.block.timestamp;
	invoke delegateByType(e2, 0, type);
	
	// this must succeed
	assert !lastReverted;
	// and there should be no delegate
	assert validNewDelegatee(getRawDelegateeByType(delegator, type), 0);
}

function check_delegation_idempotency(address delegator, address delegatee, uint8 type) {
	// setup the two environments
	env e1;
	env e2;
	call ensureValidStoredSnapshots(delegator, e1.block.number, type);
	require e1.msg.sender == e2.msg.sender && e1.msg.sender == delegator;
	require e1.msg.value == 0 && e2.msg.value == 0;
	require e2.block.number >= e1.block.number && e2.block.timestamp >= e1.block.timestamp;

	// balanceOf 0 must be 0, as well as snapshot count
	require balanceOf(0) == 0;
	require getSnapshotCount(0, type) == 0;
	
	// run first time
	sinvoke delegateByType(e1, delegatee, type);
	// get state after first operation
	address delegatee1 = getDelegateeByType(delegator, type);
	address power1 = getPowerCurrent(e1, delegator, type);
	
	// run second time - same arguments
	// success check we'll do in a different place
	//invoke delegate(e2, delegatee, type);
	//assert !lastReverted, "must succeed the second time doing the same delegate";
	sinvoke delegateByType(e2, delegatee, type);
	address delegatee2 = getDelegateeByType(delegator, type);
	address power2 = getPowerCurrent(e2, delegator, type);
	
	assert delegatee1 == delegatee2, "delegatee must preserve";
	assert power1 == power2, "power must preserve";
}

rule delegation_is_idempotent_nonzero(address delegator, address delegatee, uint8 type) {
//	// Potential issue: delegator==delegatee - can't undelegate itself - let's exclude this case
//	require delegator != delegatee;
	
	// due to packing, balance must fit in 128 bits
	call ensureValidBalances(delegator, type);
	call ensureValidBalances(delegatee, type);
	
	// here we want to assume delegatee is not zero
	require delegatee != 0;
	
	call check_delegation_idempotency(delegator, delegatee, type);
	assert true;
}

rule delegation_is_idempotent_zero(address delegator, address delegatee, uint8 type) {
//	// Potential issue: delegator==delegatee - can't undelegate itself - let's exclude this case
//	require delegator != delegatee;
	require delegator != max_address;
	require type == 0 || type == 1; // just for the internal functions support, can remove
	// due to packing, balance must fit in 128 bits
	call ensureValidBalances(delegator, type);
	call ensureValidBalances(delegatee, type);
	
	// here we want to assume delegatee is equal zero
	require delegatee == 0;
	
	call check_delegation_idempotency(delegator, delegatee, type);
	assert true;
}

rule recover_from_self_delegation(address delegator, uint8 type, method f) filtered { f -> !f.isView } {
	// due to packing, balance must fit in 128 bits
	call ensureValidBalances(delegator, type);
	
	// start with no delegatee
	require getRawDelegateeByType(delegator, type) == 0;
	
	// delegate to self
	env e;
	require e.msg.sender == delegator;
	sinvoke delegateByType(e, delegator, type);
	
	// try to modify the delegation in 1 step
	env eF;
	calldataarg arg;
	sinvoke f(eF, arg);
	
	// if violated, means we were able to recover.
	// all delegate functions should violate that
	assert getDelegateeByType(delegator, type) == delegator;
}

// status: passed, check sanity
rule advanced_reversibility_of_delegate(address delegator, address delegatee, uint8 type) {
	require delegator != 0; // impossible to call with 0
	
	// due to packing, balance must fit in 128 bits
	call ensureValidBalances(delegator, type);
	call ensureValidBalances(delegatee, type);
	
	require getDelegateeByType(delegator, type) == delegatee;
		
	// try to undelegate
	env e;
	call ensureValidStoredSnapshots(delegatee, e.block.number, type); // delegatee invariant
	call ensureValidStoredSnapshots(delegator, e.block.number, type); // invariant
	require e.msg.sender == delegator;
	// due to packing, block numbers should fit in 128bits.
	call ensureValidBlockNumber(e.block.number);
	
	sinvoke delegateByType(e, 0, type);
	
	// and there should be no delegate
	assert getRawDelegateeByType(delegator, type) == 0 || getRawDelegateeByType(delegator, type) == max_address;
}

definition validNewDelegatee(address actualNewRawDelegatee, address userProvidedDelegatee) returns bool =
	actualNewRawDelegatee == userProvidedDelegatee || (userProvidedDelegatee == 0 && actualNewRawDelegatee == max_address);

// status: passed, check sanity
//@Emilio
/*Whenever a user delegates his governance powers, his delegates address becomes the address of the delegatee (needs to be checked for both voting and proposition power).*/
rule basic_delegation_effect_delegate(address delegator, address delegatee, uint8 type) {
	env e;
	require e.msg.sender == delegator;
	sinvoke delegateByType(e, delegatee, type);
	
	address newDelegatee = getRawDelegateeByType(delegator, type);
	assert validNewDelegatee(newDelegatee, delegatee);
}

rule basic_delegation_effect_delegateAll(address delegator, address delegatee) {
	env e;
	require e.msg.sender == delegator;
	sinvoke delegate(e, delegatee);
	
	assert validNewDelegatee(getRawDelegateeByType(delegator, VOTING_POWER()), delegatee);
	assert validNewDelegatee(getRawDelegateeByType(delegator, PROPOSITION_POWER()), delegatee);
}

rule basic_delegation_effect_delegateBySig(address delegator, address delegatee, uint8 type) {
	env e;
	require e.msg.sender == delegator;
	uint256 nonce;
	uint256 expiry;
	uint8 v;
	bytes32 r;
	bytes32 s;
	
	sinvoke delegateByTypeBySig(e, delegatee, type, nonce, expiry, v, r, s);
	address actualDelegator = callEcrecover(delegatee, nonce, expiry, v, r, s);
	assert validNewDelegatee(getRawDelegateeByType(actualDelegator, type), delegatee);
}

rule basic_delegation_effect_delegateAllBySig(address delegator, address delegatee) {
	env e;
	require e.msg.sender == delegator;
	uint256 nonce;
	uint256 expiry;
	uint8 v;
	bytes32 r;
	bytes32 s;
	sinvoke delegateBySig(e, delegatee, nonce, expiry, v, r, s);
	
	assert validNewDelegatee(getRawDelegateeByType(delegator, VOTING_POWER()), delegatee);
	assert validNewDelegatee(getRawDelegateeByType(delegator, PROPOSITION_POWER()), delegatee);
}

// now make sure only delegate, delegateAll, delegateBySig, and delegateAllBySig can change delegates
rule changes_delegation(address who, uint8 type, method f) filtered { f -> !f.isView } {
	address _delegatee = getRawDelegateeByType(who, type);
	
	env eF;
	calldataarg arg;
	sinvoke f(eF, arg);
	
	address delegatee_ = getRawDelegateeByType(who, type);
	assert _delegatee == delegatee_ || isDelegateSelector(f.selector), 
		"either delegatee did not change, or we ran one of the 4 delegate functions";
}

function invokeDelegate(address delegator, address delegatee, uint8 type, uint256 time, method f) {
	env e;
	require e.msg.sender == delegator;
	require e.block.number == time;
	if (f.selector == delegateByType(address,uint8).selector) {
		sinvoke delegateByType(e, delegatee, type);
	} else if (f.selector == delegate(address).selector) {
		sinvoke delegate(e, delegatee);
	} else if (f.selector == delegateByTypeBySig(address,uint8,uint256,uint256,uint8,bytes32,bytes32).selector) {
		// must make sure that signatory == delegator. we skip
		require false;
		/*uint8 type_;
		if (type == VOTING_POWER() || type == PROPOSITION_POWER()) {
			type_ = type;
		}
		uint256 nonce;
		uint256 expiry;
		uint8 v;
		bytes32 r;
		bytes32 s;
		
		sinvoke delegateBySig(e, delegatee, type, nonce, expiry, v, r, s);
		*/
	} else if (f.selector == delegateBySig(address,uint256,uint256,uint8,bytes32,bytes32).selector) {
		// must make sure that signatory == delegator. we skip
		require false;
		/*uint256 nonce;
		uint256 expiry;
		uint8 v;
		bytes32 r;
		bytes32 s;
		
		sinvoke delegateAllBySig(e, delegatee, nonce, expiry, v, r, s);*/
	} else {
		// we only care about delegate functions
		require false;
	}
}

rule basic_delegation_effect_as_single_rule(address delegator, address delegatee, method f) filtered { f -> !f.isView } {
	uint256 time;
	call invokeDelegate(delegator, delegatee, 7/*fake - will take any*/, time, f);
	
	assert validNewDelegatee(getRawDelegateeByType(delegator, VOTING_POWER()), delegatee)
	 || validNewDelegatee(getRawDelegateeByType(delegator, PROPOSITION_POWER()), delegatee);
}

/////// POWER RELATED
rule changes_power(address who, uint8 type, uint256 time, method f) filtered { f -> !f.isView } {
	// due to packing, balance must fit in 128 bits
	call ensureValidBalances(who, type);
	
	env eF;
	require eF.block.number == time;
	env eGet;
	require eGet.block.number == time;
	
	uint256 _power = getPowerCurrent(eGet, who, type);
	
	calldataarg arg;
	sinvoke f(eF, arg);
	
	uint256 power_ = getPowerCurrent(eGet, who, type);
	
	assert _power == power_;
}

// rule no longer true
// if a user has a delegate, they must have a positive snapshot count.
// user 0 makes no sense in current blockchain, but it will break since the movement ignores 0 so no snapshots are updated for 0.
// if one delegates itself, then no snapshots are made.
// in init state one has delegate of 0 and no snapshots
invariant delegate_and_count_inv(address u, uint8 type) 
	(u != 0 && getRawDelegateeByType(u, type) != 0 && getRawDelegateeByType(u, type) != u) => ((type == VOTING_POWER() => _votingPowerSnapshotsCounts(u) > 0) && (type == PROPOSITION_POWER() => _propositionPowerSnapshotsCounts(u) > 0))
	

// Checking if when A delegates to C and B delegates to C; afterwards A undelegates C to itself, then it's possible A's has more additional power than expected (this is stealing!)
rule cant_steal_delegates(address A, address B, address C, uint8 type) {
	require A != B && B != C && A != C;
	require A != 0 && B != 0 && C != 0;
	requireInvariant delegate_and_count_inv(A, type);
	requireInvariant delegate_and_count_inv(B, type);
	requireInvariant delegate_and_count_inv(C, type);
	require getRawDelegateeByType(A, type) == 0 || getRawDelegateeByType(A, type) == A;
	uint256 now;
	require isUint128(now);
	require getLastSnapshotBlockNumber(A, type) <= now;
	require getLastSnapshotBlockNumber(B, type) <= now;
	require getLastSnapshotBlockNumber(C, type) <= now;
	
	env e;
	require e.block.number == now;
	uint256 _powA = getPowerCurrent(e, A, type);
	
	env eA;
	require eA.block.number == now;
	require eA.msg.sender == A;
	env eB;
	require eB.block.number == now;
	require eB.msg.sender == B;
	sinvoke delegateByType(eA, B, type);
	sinvoke delegateByType(eB, C, type);
	sinvoke delegateByType(eA, A, type);

	uint256 powA_ = getPowerCurrent(e, A, type);
	
	assert _powA == powA_, "A should have retrieved the same power no more no less";
}

// TODO: Can't manipulate historical snapshots

//@Emilio
/*When a user delegates his governance powers (both voting and proposition power) to another user, his getPowerCurrent() is 0 and the getPowerCurrent() of the delegatee is increased by his balance (property needs to be checked for delegate(), delegateAll(), delegateBySig() and delegateAllBySig())*/
// the above formulation is also not correct because we only delegate our balance, not stuff that other users delegates to us
rule delegation_power_update(address delegator, address delegatee, uint8 type, method f) filtered { f -> !f.isView } {
	require delegator != delegatee; // self delegations should be handled separately TODO
	require delegatee != 0; // known problematic case, not applicable here
	require delegator != 0; // a reasonable assumption for Ethereum
	address currentDelegatee = getRawDelegateeByType(delegator, type);
	require currentDelegatee == delegator || currentDelegatee == 0; // current delegatee must be either delegator or 0 (or it means our balance is already delegated to someone)
		
	env eGet;
	call ensureValidStoredSnapshots(delegator, eGet.block.number, type);
	call ensureValidStoredSnapshots(delegatee, eGet.block.number, type);
	
	uint256 origPowerDelegator = getPowerCurrent(eGet, delegator, type);
	uint256 origPowerDelegatee = getPowerCurrent(eGet, delegatee, type);
	uint256 delegatorBalance = balanceOf(delegator);
	require canAddWithoutOverflow128(delegatorBalance);
	
	// A successful delegation
	call invokeDelegate(delegator, delegatee, type, eGet.block.number, f);
	
	uint256 newPowerDelegatee = getPowerCurrent(eGet, delegatee, type);
	assert newPowerDelegatee == origPowerDelegatee + delegatorBalance, "Power of delegatee not updated correctly";
	assert getPowerCurrent(eGet, delegator, type) == origPowerDelegator - delegatorBalance, "Power of delegator should have be reduced by the balance after delegating";
}

function invokeTransfer(address from, address to, uint256 amt, uint256 time, method f) {
	env e;
	require e.block.number == time;
	if (f.selector == transfer(address,uint256).selector) {
		require e.msg.sender == from;
		sinvoke transfer(e, to, amt);
	} else if (f.selector == transferFrom(address,address,uint256).selector) {
		sinvoke transferFrom(e, from, to, amt);
	} else {
		calldataarg arg;
		sinvoke f(e, arg);
	}
}

function getDelegateBeneficiary(address who, uint8 type, address out) {
	address _delegatee = getRawDelegateeByType(who, type);
	address _poweredUser;
	if (_delegatee == 0 || _delegatee == max_address) {
		_poweredUser = who;
	} else {
		_poweredUser = _delegatee;
		if (type == VOTING_POWER()) {
			require _votingPowerSnapshotsCounts(_poweredUser) >= 1;
		} else {
			require _propositionPowerSnapshotsCounts(_poweredUser) >= 1;
		}
	}
	require out == _poweredUser;
}

//@Emilio
/*When a user transfers tokens to another address, his powers (or his delegates powers) are decreased by the amount that the user is transferring out.*/ // 1 // this rule is supposed to fail on transfer functions
/*When a user receives tokens, the receiving address governance powers (or his delegates) are increased by the received amount.*/ // 2 // this rule is supposed to fail on transfer functions

// correction of the above rules:
// Sum of powers of "effective delegates" of A and B is preserved when A transfer to B (via transfer or transferFrom)
// and power difference is updated accordingly
rule transfer_updates_power(address from, uint8 type, method f) filtered { f -> !f.isView } {
	env e;
	uint256 now = e.block.number;
	address to;
	uint256 amt;
	require canAddWithoutOverflow128(amt); // to avoid 128 bit overflows when transferring
	
	address poweredUser;
	call getDelegateBeneficiary(from, type, poweredUser);	
	call ensureValidStoredSnapshots(poweredUser, now, type);
	
	address poweredUserTo;
	call getDelegateBeneficiary(to, type, poweredUserTo);
	
	// for from
	uint256 _power = getPowerCurrent(e, poweredUser, type);
	uint256 _balance = balanceOf(from);
	require canAddWithoutOverflow128(_balance);
	
	// for to
	uint256 _powerTo = getPowerCurrent(e, poweredUserTo, type);
	uint256 _balanceTo = balanceOf(to);
	require canAddWithoutOverflow128(_balanceTo);
		
	call invokeTransfer(from, to, amt, now, f);
			
	// for from	
	uint256 power_ = getPowerCurrent(e, poweredUser, type);
	uint256 balance_ = balanceOf(from);
		
	// for to
	uint256 powerTo_ = getPowerCurrent(e, poweredUserTo, type);
	
	bool balanceChanged = _balance != balance_;
	if (poweredUser != poweredUserTo) {
		assert balanceChanged => _power + _powerTo == power_ + powerTo_, "sum of powers is preserved if balances changed";
		assert balanceChanged => _power - power_ == _balance - balance_, "from delegatee power reduced by balance reduction amount";
		assert balanceChanged => powerTo_ - _powerTo == _balance - balance_, "to delegatee power increased by balance increase amount";
	} else {
		assert balanceChanged => _power == power_;
	}
	
	assert true;
}

// status: updated to take into account opting-out of governance
//@Emilio
/*Whenever a user executes a transfer() or delegate(), his snapshot count (and the snapshot count of the target) is increased (needs to be checked for both voting and proposition power)*/
// the increase is violated for self-transfers
rule changes_snapshot_count(address user, method f, uint8 type) filtered { f -> !f.isView } {
	uint256 _count = getSnapshotCount(user, type);
		
	env e;
	ensureValidStoredSnapshots(user, e.block.timestamp, type);
	calldataarg arg;
	require e.msg.sender == user;
	sinvoke f(e, arg);
	
	uint256 count_ = getSnapshotCount(user, type);

	assert count_ == _count + 1 || count_ == _count || count_ == 0;
}

// status: passed
// a user that is getting delegates must have a positive snapshot count, unless it has snapshots off	
rule once_becoming_delegatee_must_have_a_snapshot(address delegatee, uint8 t) {
	require delegatee != 0; // necessary
	address delegator;
	
	env e;
	require e.msg.sender == delegator;
	require isUint128(e.block.number);
	require delegator != delegatee; // self delegations do not generate a snapshot
	require getRawDelegateeByType(delegator, t) != delegatee; // we're not delegating to the current delegator
	ensureValidStoredSnapshots(delegatee, e.block.number, t);
	sinvoke delegateByType(e, delegatee, t); // for simplicity, checking just delegate()

	uint256 count = 0;
	if (t == VOTING_POWER()) {
		count = _votingPowerSnapshotsCounts(delegatee);
	} else if (t == PROPOSITION_POWER()) {
		count = _propositionPowerSnapshotsCounts(delegatee);
	} else {
		assert false, "must have a legal type";
	}
	
	assert count >= 1 || getRawDelegateeByType(delegatee, t) == max_address, "delegatee must have snapshots after getting the delegation, unless delegatee has snapshots off";
}

// status: passed
//@Emilio
/*Delegating one type of governance power does not influence the other type */
rule delegation_type_independence(address who, method f) filtered { f -> !f.isView } {
	address _delegateeV = getRawDelegateeByType(who, VOTING_POWER());
	address _delegateeP = getRawDelegateeByType(who, PROPOSITION_POWER());
	
	env eF;
	calldataarg arg;
	sinvoke f(eF, arg);
	
	address delegateeV_ = getRawDelegateeByType(who, VOTING_POWER());
	address delegateeP_ = getRawDelegateeByType(who, PROPOSITION_POWER());
	assert (_delegateeV == delegateeV_  || _delegateeP == delegateeP_) || (
		f.selector == delegate(address).selector ||
		f.selector == delegateBySig(address,uint256,uint256,uint8,bytes32,bytes32).selector
	), "one delegatee type stays the same, unless delegate or delegateBySig was called";
}

// status: passed - took 23541 seconds
invariant ifSnapshotsAreOffMustHaveNoSnapshots(address delegator, uint8 type)
	getRawDelegateeByType(delegator, type) == max_address => getSnapshotCount(delegator, type) == 0