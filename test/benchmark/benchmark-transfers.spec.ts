import chai, {expect} from 'chai';
import {fail} from 'assert';
import {solidity} from 'ethereum-waffle';
import {TestEnv, makeSuite} from './../helpers/make-suite';
import {ProtocolErrors, eContractid} from '../../helpers/types';
import {
  DRE,
  advanceBlock,
  timeLatest,
  waitForTx,
  evmRevert,
  evmSnapshot,
  impersonateAccountsHardhat,
  shuffle,
  randomnizeAddress,
} from '../../helpers/misc-utils';
import {
  buildDelegateParams,
  buildDelegateByTypeParams,
  deployAaveTokenV2,
  deployDoubleTransferHelper,
  getContract,
  deploySelfDestruct,
} from '../../helpers/contracts-helpers';
import {AAVE, LONG_EXECUTOR} from '../../helpers/constants';
import {MAX_UINT_AMOUNT, ZERO_ADDRESS, AAVE, LOONG_EXECUTOR} from '../../helpers/constants';
import {parseEther} from 'ethers/lib/utils';
import { AaveTokenV2 } from '../../types/AaveTokenV2';

chai.use(solidity);

makeSuite('Benchmark (@fork-mode)', (testEnv: TestEnv) => {
  const {} = ProtocolErrors;
  let aaveInstance = {} as AaveTokenV2;
  let firstActionBlockNumber = 0;
  let secondActionBlockNumber = 0;
  let revertId: string;

  it('Updates the implementation of the AAVE token to V2', async () => {
    const {aaveToken, users} = testEnv;
    let holders: Array<string> = [];
    //getting the proxy contract from the aave token address
    const aaveTokenProxy = await getContract(
      eContractid.InitializableAdminUpgradeabilityProxy,
      AAVE
    );
    impersonateAccountsHardhat([LOONG_EXECUTOR]);
    aaveInstance = await getContract(eContractid.AaveTokenV2, aaveTokenProxy.address);
    const executorSigner = DRE.ethers.provider.getSigner(LOONG_EXECUTOR);
    const AAVEv2 = await deployAaveTokenV2();
    const filter = aaveInstance.filters.Transfer(null, null, null);
    const transfers = await aaveInstance.queryFilter(
      filter,
      Number(process.env.FORKING_BLOCK) - 1000,
      Number(process.env.FORKING_BLOCK)
    );
    for (let i = 0; i < transfers.length; i++) {
      const log = transfers[i];
      const to = log.args?.to;
      const aaveBalance = await aaveInstance.balanceOf(to);
      const ethBalance = await DRE.ethers.provider.getBalance(to);
      const minBalance = parseEther('1');
      if (aaveBalance.gt(minBalance) && ethBalance.gt(minBalance)) {
        holders.push(to);
      }
    }
    console.log(` 
    Benchmark: 
** Impersonating Aave token holders at block ${Number(process.env.FORKING_BLOCK)}
** Number of holders impersonated: ${holders.length}
    `);
    await impersonateAccountsHardhat([...holders]);
    let signer;
    const shuffled = shuffle(holders.map((x) => x));
    const oftenEmptyAddresses = randomnizeAddress(
      holders.map((x) => x),
      '2'
    );
    const oftenEmptyAddresses2 = randomnizeAddress(
      holders.map((x) => x),
      '3'
    );
    let gasV2TransfersBetweenHolders = 0;
    let countV2TransfersBetweenHolders = 0;
    let countV2TransfersBetweenHolderAndEmpty = 0;
    let gasV2TransfersBetweenHolderAndEmpty = 0;

    let gasV25TransfersBetweenHolders = 0;
    let countV25TransfersBetweenHolders = 0;
    let gasV25TransfersBetweenHolderAndEmpty = 0;
    let countV25TransfersBetweenHolderAndEmpty = 0;

    let gasV25TransfersBetweenHoldersDel = 0;
    let countV25TransfersBetweenHoldersDel = 0;
    let gasV25TransfersBetweenHolderAndEmptyDel = 0;
    let countV25TransfersBetweenHolderAndEmptyDel = 0;

    for (const [i, address] of holders.entries()) {
      signer = DRE.ethers.provider.getSigner(address);
      const tx1 = await aaveInstance.connect(signer).transfer(shuffled[i], 2);
      const gas1 = (await tx1.wait()).gasUsed;
      gasV2TransfersBetweenHolders += gas1.toNumber();
      countV2TransfersBetweenHolders++;
      const tx2 = await aaveInstance.connect(signer).transfer(oftenEmptyAddresses[i], 2);
      const gas2 = (await tx2.wait()).gasUsed;
      gasV2TransfersBetweenHolderAndEmpty += gas2.toNumber();
      countV2TransfersBetweenHolderAndEmpty++;
    }

    const encodedIntialize = AAVEv2.interface.encodeFunctionData('initialize');
    const SelfDestructContract = await deploySelfDestruct();
    await waitForTx(
      await SelfDestructContract.destroyAndTransfer(LOONG_EXECUTOR, {value: parseEther('10')})
    );
    await aaveTokenProxy.connect(executorSigner).upgradeToAndCall(AAVEv2.address, encodedIntialize);
    aaveInstance = await getContract(eContractid.AaveTokenV2, aaveTokenProxy.address);
    expect((await aaveInstance.REVISION()).toString()).to.be.equal('3');

    aaveInstance = await getContract(eContractid.AaveTokenV2, aaveTokenProxy.address);
    for (const [i, address] of holders.entries()) {
      signer = DRE.ethers.provider.getSigner(address);
      const tx1 = await aaveInstance.connect(signer).transfer(shuffled[i], 2);
      const gas1 = (await tx1.wait()).gasUsed;
      gasV25TransfersBetweenHolders += gas1.toNumber();
      countV25TransfersBetweenHolders++;
      const tx2 = await aaveInstance.connect(signer).transfer(oftenEmptyAddresses[i], 2);
      const gas2 = (await tx2.wait()).gasUsed;
      gasV25TransfersBetweenHolderAndEmpty += gas2.toNumber();
      countV25TransfersBetweenHolderAndEmpty++;
    }
    for (const [i, address] of holders.entries()) {
      signer = DRE.ethers.provider.getSigner(address);
      const tx = await aaveInstance.connect(signer).delegate(address);
      const tx1 = await aaveInstance.connect(signer).transfer(shuffled[i], 2);
      const gas1 = (await tx1.wait()).gasUsed;
      gasV25TransfersBetweenHoldersDel += gas1.toNumber();
      countV25TransfersBetweenHoldersDel++;
      const tx2 = await aaveInstance.connect(signer).transfer(oftenEmptyAddresses2[i], 2);
      const gas2 = (await tx2.wait()).gasUsed;
      gasV25TransfersBetweenHolderAndEmptyDel += gas2.toNumber();
      countV25TransfersBetweenHolderAndEmptyDel++;
    }
    console.log(`
------------- V2 --------------------------------------------------
  ** Transfers Between Holders:
    - Total Gas : ${gasV2TransfersBetweenHolders}
    - Tx Number: ${countV2TransfersBetweenHolders}
    - Average: ${gasV2TransfersBetweenHolders / countV2TransfersBetweenHolders}
  ** Transfers Holders <> New Holders: 
    - Total Gas : ${gasV2TransfersBetweenHolderAndEmpty}
    - Tx Number: ${countV2TransfersBetweenHolderAndEmpty}
    - Average: ${gasV2TransfersBetweenHolderAndEmpty / countV2TransfersBetweenHolderAndEmpty}
------------- V2.5 SNAPSHOTS OFF ----------------------------------
  ** Transfers Between Holders:
    - Total Gas : ${gasV25TransfersBetweenHolders}
    - Tx Number: ${countV25TransfersBetweenHolders}
    - Average: ${gasV25TransfersBetweenHolders / countV25TransfersBetweenHolders}
  ** Transfers Holders <> New Holders: 
    - Total Gas : ${gasV25TransfersBetweenHolderAndEmpty}
    - Tx Number: ${countV25TransfersBetweenHolderAndEmpty}
    - Average: ${gasV25TransfersBetweenHolderAndEmpty / countV25TransfersBetweenHolderAndEmpty}
------------- V2.5 SNAPSHOTS ON (BY OPTIN DELEGATION) -------------
  ** Transfers Between Holders:
    - Total Gas : ${gasV25TransfersBetweenHoldersDel}
    - Tx Number: ${countV25TransfersBetweenHoldersDel}
    - Average: ${gasV25TransfersBetweenHoldersDel / countV25TransfersBetweenHoldersDel}
  ** Transfers Holders <> New Holders: 
    - Total Gas : ${gasV25TransfersBetweenHolderAndEmptyDel}
    - Tx Number: ${countV25TransfersBetweenHolderAndEmptyDel}
    - Average: ${
      gasV25TransfersBetweenHolderAndEmptyDel / countV25TransfersBetweenHolderAndEmptyDel
    }
    `);
  });
});
