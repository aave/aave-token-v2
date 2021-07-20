certoraRun spec/harness/AaveTokenHarnessV2.sol spec/harness/DummyGovernance.sol \
    --link AaveTokenHarnessV2:_aaveGovernance=DummyGovernance \
    --verify AaveTokenHarnessV2:spec/snapshots.spec \
    --optimistic_loop \
    --staging --settings -t=60,-depth=12 --msg "snapshots AaveToken"