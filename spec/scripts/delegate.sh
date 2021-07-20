certoraRun spec/harness/AaveTokenHarnessV2.sol spec/harness/DummyGovernance.sol \
    --link AaveTokenHarnessV2:_aaveGovernance=DummyGovernance \
    --verify AaveTokenHarnessV2:spec/delegate.spec \
    --optimistic_loop \
    --staging --settings -t=60,-depth=20 --msg "delegate AaveToken"
