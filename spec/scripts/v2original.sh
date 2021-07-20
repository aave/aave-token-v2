certoraRun spec/harness/AaveTokenHarnessV2.sol spec/harness/DummyGovernance.sol \
    --link AaveTokenHarnessV2:_aaveGovernance=DummyGovernance \
    --verify AaveTokenHarnessV2:spec/aave.v2.token.spec \
    --optimistic_loop \
    --staging --msg "basic AaveToken"
