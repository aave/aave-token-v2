methods {
	totalSupply() returns uint256 envfree
}

definition MASK128() returns uint256 = 340282366920938463463374607431768211455;
definition getValue(uint256 blockAndValue) returns uint256 = MASK128() & blockAndValue;

sort ADDRESS;
sort COUNTER;

ghost toAddress(address) returns ADDRESS;
ghost toCounter(uint256) returns COUNTER;

ghost currentCounter(ADDRESS) returns uint256;
ghost votePowerSum() returns mathint;
ghost shadowSnapshots(ADDRESS,COUNTER) returns uint256;

 
hook Sstore _votingSnapshots[KEY address user][KEY uint256 count] uint256 blockAndValue (uint256 oldBandV) STORAGE {
	havoc shadowSnapshots assuming shadowSnapshots@new(toAddress(user),toCounter(count)) == blockAndValue && (forall ADDRESS a. forall COUNTER c. (a != toAddress(user) || c != toCounter(count)) => shadowSnapshots@new(a,c) == shadowSnapshots@old(a,c));
	
//	if (count == currentCounter(toAddress(user))) {
		havoc votePowerSum assuming votePowerSum@new() == votePowerSum@old() - getValue(oldBandV) + getValue(blockAndValue);
	//} else {
		//havoc votePowerSum assuming votePowerSum@new() == votePowerSum@old();
	//}
}

hook Sstore _votingSnapshotsCounts[KEY address user] uint256 counter (uint256 oldCounter) STORAGE {
	havoc currentCounter assuming currentCounter@new(toAddress(user)) == counter && (forall ADDRESS a. a != toAddress(user) => currentCounter@new(a)==currentCounter@old(a));
	havoc votePowerSum assuming votePowerSum@new() == votePowerSum@old() - getValue(shadowSnapshots(toAddress(user),toCounter(oldCounter))) + getValue(shadowSnapshots(toAddress(user),toCounter(counter)));
}

invariant votePowerIsTotalSupply() votePowerSum() == totalSupply()