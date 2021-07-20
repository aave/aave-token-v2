certoraRun spec/harness/MigratorHarness.sol spec/harness/DummyGovernance.sol contracts/token/AaveToken.sol spec/EthLendToken.sol \
    --verify MigratorHarness:spec/migrator.spec \
    --solc solc6.10 \
    --settings -assumeUnwindCond,-ruleSanityChecks,-useNonLinearArithmetic \
    --solc_map MigratorHarness=solc6.10,AaveToken=solc6.10,EthLendToken=solc4.25 \
    --link MigratorHarness:AAVE=AaveToken MigratorHarness:LEND=EthLendToken AaveToken:_aaveGovernance=DummyGovernance \
    --path spec,contracts/ \
    --staging