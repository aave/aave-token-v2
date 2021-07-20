certoraRun spec/harness/AaveTokenHarnessV2.sol spec/harness/DummyGovernance.sol \
    --link AaveTokenHarnessV2:_aaveGovernance=DummyGovernance \
    --verify AaveTokenHarnessV2:spec/sanity.spec \
    --optimistic_loop \
    --staging
