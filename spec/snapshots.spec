methods {
    getDelegateeByType(address,uint8) returns address envfree
    balanceOf(address) returns uint envfree
}

definition snpashotsOffDelegatee() returns uint256 = max_address;

rule delegateeCanChangeToSnapshotOffOnlyIfWas0(address delegator, uint8 type, method f, uint time) {
    address _delegatee = getDelegateeByType(delegator, type);

    callMethodWithTime(f, time);

    address delegatee_ = getDelegateeByType(delegator, type);
    env e;
    require e.block.timestamp == time;
    uint power = getPowerCurrent(e, delegator, type);
    uint balance = balanceOf(delegator);

    assert _delegatee != delegatee_ =>
        delegatee_ == snpashotsOffDelegatee() => power == balance, "can change delegatee to snapshots off only if power is 0, or snapshots off before";

}


function callMethodWithTime(method f, uint time) {
    env e;
    require e.block.timestamp == time;
    calldataarg arg;
    f(e, arg);
}

function callMethod(method f) {
    env e;
    calldataarg arg;
    f(e, arg);
}