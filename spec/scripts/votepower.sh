certoraRun spec/harness/AaveTokenHarnessV2.sol \
    --verify AaveTokenHarnessV2:spec/power_sum_manual_voting.spec \
    --optimistic_loop \
    --staging --settings -t=30,-depth=20 --msg "vote power ghost AaveToken"
