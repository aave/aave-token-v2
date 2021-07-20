certoraRun spec/harness/AaveTokenHarnessV2.sol spec/harness/DummyGovernance.sol \
    --link AaveTokenHarnessV2:_aaveGovernance=DummyGovernance \
    --verify AaveTokenHarnessV2:spec/delegate.spec \
    --optimistic_loop \
    --rule $1 \
    --staging --settings -t=120,-depth=20,-postProcessCounterExamples=true,-globalTimeout=17000 --msg "delegate AaveToken - $1"
