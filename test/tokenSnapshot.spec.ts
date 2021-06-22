import chai, {expect} from 'chai';
import {fail} from 'assert';
import {solidity} from 'ethereum-waffle';
import {TestEnv, makeSuite, SignerWithAddress} from './helpers/make-suite';
import {ProtocolErrors, eContractid} from '../helpers/types';
import {
  DRE,
  advanceBlock,
  timeLatest,
  waitForTx,
  evmRevert,
  evmSnapshot,
} from '../helpers/misc-utils';
import {
  buildDelegateParams,
  buildDelegateByTypeParams,
  deployAaveTokenV2,
  deployDoubleTransferHelper,
  getContract,
  getCurrentBlock,
  getSignatureFromTypedData,
} from '../helpers/contracts-helpers';
import {AaveTokenV2} from '../types/AaveTokenV2';
import {MAX_UINT_AMOUNT, ZERO_ADDRESS} from '../helpers/constants';
import {formatEther, parseEther, _toEscapedUtf8String} from 'ethers/lib/utils';
import {ITransferHook, UpgradeabilityProxy} from './types';
import {InitializableAdminUpgradeabilityProxy} from '../types/InitializableAdminUpgradeabilityProxy';
import {Signer} from 'crypto';
import {isRegExp} from 'util';
import {BigNumber} from 'ethers';
import {zeroAddress} from 'ethereumjs-util';
import {DEFAULT_ECDH_CURVE} from 'tls';

chai.use(solidity);

enum DelegationType {
  VOTING_POWER,
  PROPOSITION_POWER,
}

makeSuite('Testing token snapshots fuzz like approach', async (testEnv: TestEnv) => {
  const lendAmount = parseEther('100000');
  const aaveAmount = lendAmount.div(1000);
  const {} = ProtocolErrors;
  let aaveInstance = {} as AaveTokenV2;

  let AAVEv2: AaveTokenV2;

  let Alice: SignerWithAddress;
  let Bob: SignerWithAddress;
  let Charlie: SignerWithAddress;
  let Diane: SignerWithAddress;
  let PoorTom: SignerWithAddress;

  let snapFundedV2: string;

  it('Starts the migration', async () => {
    const {lendToAaveMigrator, lendToAaveMigratorImpl} = testEnv;

    const lendToAaveMigratorInitializeEncoded = lendToAaveMigratorImpl.interface.encodeFunctionData(
      'initialize'
    );

    const migratorAsProxy = await getContract(
      eContractid.InitializableAdminUpgradeabilityProxy,
      lendToAaveMigrator.address
    );

    await migratorAsProxy
      .connect(testEnv.users[0].signer)
      .upgradeToAndCall(lendToAaveMigratorImpl.address, lendToAaveMigratorInitializeEncoded);
  });

  it('Mint tokens to users!', async () => {
    const {lendToAaveMigrator, users, aaveToken, lendToken} = testEnv;

    Alice = users[1];
    Bob = users[2];
    Charlie = users[3];
    Diane = users[4];
    PoorTom = users[5];

    let people = [Alice, Bob, Charlie, Diane];

    for (let i = 0; i < 4; i++) {
      let person = people[i];
      await lendToken.connect(person.signer).mint(lendAmount);
      await lendToken.connect(person.signer).approve(lendToAaveMigrator.address, MAX_UINT_AMOUNT);
      expect(await lendToken.balanceOf(person.address)).to.be.eq(lendAmount);
      await lendToAaveMigrator.connect(person.signer).migrateFromLEND(lendAmount);
      expect(await aaveToken.balanceOf(person.address)).to.be.eq(aaveAmount);
    }
  });

  it('Update the implementation of the AAVE token to V2', async () => {
    const {aaveToken, users, deployer} = testEnv;

    //getting the proxy contract from the aave token address
    const aaveTokenProxy = await getContract(
      eContractid.InitializableAdminUpgradeabilityProxy,
      aaveToken.address
    );

    AAVEv2 = await deployAaveTokenV2();

    const encodedIntialize = AAVEv2.interface.encodeFunctionData('initialize');

    await aaveTokenProxy
      .connect(users[0].signer)
      .upgradeToAndCall(AAVEv2.address, encodedIntialize);

    aaveInstance = await getContract(eContractid.AaveTokenV2, aaveTokenProxy.address);

    expect(await aaveInstance.balanceOf(Alice.address)).to.be.eq(aaveAmount);
    let propositionPower = await aaveInstance.getPowerCurrent(
      Alice.address,
      DelegationType.PROPOSITION_POWER
    );
    let votingPower = await aaveInstance.getPowerCurrent(
      Alice.address,
      DelegationType.VOTING_POWER
    );
    expect(propositionPower).to.be.eq(aaveAmount);
    expect(votingPower).to.be.eq(aaveAmount);

    const propositionDelegatee = await aaveInstance.getDelegateeByType(
      Alice.address,
      DelegationType.PROPOSITION_POWER
    );
    const votingDelegatee = await aaveInstance.getDelegateeByType(
      Alice.address,
      DelegationType.VOTING_POWER
    );
    expect(propositionDelegatee).to.be.eq(Alice.address);
    expect(votingDelegatee).to.be.eq(Alice.address);
    snapFundedV2 = await evmSnapshot();
  });

  it('Check power == balance, delegatee == self and isSnapshotted before any actions', async () => {
    await evmRevert(snapFundedV2);
    snapFundedV2 = await evmSnapshot();

    let people = [Alice, Bob, Charlie, Diane];

    for (let i = 0; i < 4; i++) {
      const person = people[i];
      const power = await aaveInstance.getPowerCurrent(
        person.address,
        DelegationType.PROPOSITION_POWER
      );
      const propositionDelegatee = await aaveInstance.getDelegateeByType(
        person.address,
        DelegationType.PROPOSITION_POWER
      );
      const votingDelegatee = await aaveInstance.getDelegateeByType(
        person.address,
        DelegationType.VOTING_POWER
      );
      const isPerson0xff1 = !(await aaveInstance.isSnapshotted(
        person.address,
        DelegationType.PROPOSITION_POWER
      ));

      expect(power).to.be.eq(aaveAmount);
      expect(propositionDelegatee).to.be.eq(person.address);
      expect(votingDelegatee).to.be.eq(person.address);
      expect(isPerson0xff1).to.be.eq(false);
      // In reality, we are delegating to 0x00 here. But it is overridden.
    }
  });

  describe('Standard actions', async () => {
    it('Alice delegate to herself', async () => {
      await evmRevert(snapFundedV2);
      snapFundedV2 = await evmSnapshot();

      await waitForTx(await aaveInstance.connect(Alice.signer).delegate(Alice.address));

      const delegatee2 = await aaveInstance.getDelegateeByType(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const alicePower2 = await aaveInstance.getPowerCurrent(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const isAlice0xff2 = !(await aaveInstance.isSnapshotted(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      ));

      expect(delegatee2).to.be.eq(Alice.address);
      expect(alicePower2).to.be.eq(aaveAmount);
      expect(isAlice0xff2).to.be.eq(false);
    });

    it('Alice delegate to Bob', async () => {
      await evmRevert(snapFundedV2);
      snapFundedV2 = await evmSnapshot();

      const delegatee1 = await aaveInstance.getDelegateeByType(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const alicePower1 = await aaveInstance.getPowerCurrent(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      expect(delegatee1).to.be.eq(Alice.address);
      expect(alicePower1).to.be.eq(aaveAmount);

      await waitForTx(await aaveInstance.connect(Alice.signer).delegate(Bob.address));

      const delegatee2 = await aaveInstance.getDelegateeByType(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const alicePower2 = await aaveInstance.getPowerCurrent(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const bobPower2 = await aaveInstance.getPowerCurrent(
        Bob.address,
        DelegationType.PROPOSITION_POWER
      );
      expect(delegatee2).to.be.eq(Bob.address);
      expect(alicePower2).to.be.eq(0);
      expect(bobPower2).to.be.eq(aaveAmount.mul(2));
    });

    it('Alice delegate to 0x00', async () => {
      await evmRevert(snapFundedV2);
      snapFundedV2 = await evmSnapshot();

      const delegatee1 = await aaveInstance.getDelegateeByType(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const alicePower1 = await aaveInstance.getPowerCurrent(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      expect(delegatee1).to.be.eq(Alice.address);
      expect(alicePower1).to.be.eq(aaveAmount);

      await waitForTx(await aaveInstance.connect(Alice.signer).delegate(ZERO_ADDRESS));

      const delegatee2 = await aaveInstance.getDelegateeByType(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const alicePower2 = await aaveInstance.getPowerCurrent(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const isAlice0xff = !(await aaveInstance.isSnapshotted(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      ));
      expect(await aaveInstance.balanceOf(Alice.address)).to.be.eq(aaveAmount);
      expect(alicePower2).to.be.eq(0);
      expect(isAlice0xff).to.be.eq(true);
      expect(delegatee2).to.be.eq(Alice.address);
    });

    it('Bob delegates to Charlie, Alice delegates to Bob', async () => {
      await evmRevert(snapFundedV2);
      snapFundedV2 = await evmSnapshot();

      await aaveInstance
        .connect(Bob.signer)
        .delegateByType(Charlie.address, DelegationType.PROPOSITION_POWER);

      await aaveInstance
        .connect(Bob.signer)
        .delegateByType(ZERO_ADDRESS, DelegationType.PROPOSITION_POWER);

      await aaveInstance
        .connect(Alice.signer)
        .delegateByType(Bob.address, DelegationType.PROPOSITION_POWER);

      const bobPower = await aaveInstance.getPowerCurrent(
        Bob.address,
        DelegationType.PROPOSITION_POWER
      );
      expect(bobPower).to.be.eq(aaveAmount.mul(2));
    });

    it('Bob delegates to 0x00, Alice delegates to Bob', async () => {
      await evmRevert(snapFundedV2);
      snapFundedV2 = await evmSnapshot();

      await aaveInstance.connect(Bob.signer).delegate(ZERO_ADDRESS);
      const isBob0xff1 = !(await aaveInstance.isSnapshotted(
        Bob.address,
        DelegationType.PROPOSITION_POWER
      ));
      expect(isBob0xff1).to.be.eq(true);

      const bobPower1 = await aaveInstance.getPowerCurrent(
        Bob.address,
        DelegationType.PROPOSITION_POWER
      );
      expect(bobPower1).to.be.eq(0);

      await aaveInstance.connect(Alice.signer).delegate(Bob.address);
      const isBob0xff2 = !(await aaveInstance.isSnapshotted(
        Bob.address,
        DelegationType.PROPOSITION_POWER
      ));
      expect(isBob0xff2).to.be.eq(false);

      const bobPower2 = await aaveInstance.getPowerCurrent(
        Bob.address,
        DelegationType.PROPOSITION_POWER
      );
      expect(bobPower2).to.be.eq(aaveAmount.mul(2));

      const propositionPowerAtBlock = await aaveInstance.getPowerAtBlock(
        Bob.address,
        await getCurrentBlock(),
        DelegationType.PROPOSITION_POWER
      );
      const votingPowerAtBlock = await aaveInstance.getPowerAtBlock(
        Bob.address,
        await getCurrentBlock(),
        DelegationType.VOTING_POWER
      );

      expect(propositionPowerAtBlock).to.be.eq(aaveAmount.mul(2));
      expect(votingPowerAtBlock).to.be.eq(aaveAmount.mul(2));
    });

    it('Alice delegate to Bob, Bob delegate to 0x00, Alice delegates to 0x00', async () => {
      await evmRevert(snapFundedV2);
      snapFundedV2 = await evmSnapshot();

      await aaveInstance
        .connect(Alice.signer)
        .delegateByType(Bob.address, DelegationType.PROPOSITION_POWER);

      await aaveInstance
        .connect(Bob.signer)
        .delegateByType(ZERO_ADDRESS, DelegationType.PROPOSITION_POWER);

      let bobPower = await aaveInstance.getPowerCurrent(
        Bob.address,
        DelegationType.PROPOSITION_POWER
      );
      expect(bobPower).to.be.eq(aaveAmount.mul(2));

      await aaveInstance
        .connect(Alice.signer)
        .delegateByType(ZERO_ADDRESS, DelegationType.PROPOSITION_POWER);

      let bobPower2 = await aaveInstance.getPowerCurrent(
        Bob.address,
        DelegationType.PROPOSITION_POWER
      );
      let alicePower2 = await aaveInstance.getPowerCurrent(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );

      expect(bobPower2).to.be.eq(0);
      expect(alicePower2).to.be.eq(0);
    });

    it('Alice transfer funds to Bob', async () => {
      await evmRevert(snapFundedV2);
      snapFundedV2 = await evmSnapshot();

      await waitForTx(await aaveInstance.connect(Alice.signer).transfer(Bob.address, aaveAmount));

      const aliceBalance2 = await aaveInstance.balanceOf(Alice.address);
      const bobBalance2 = await aaveInstance.balanceOf(Bob.address);
      expect(aliceBalance2).to.be.eq(0);
      expect(bobBalance2).to.be.eq(aaveAmount.mul(2));
      const aliceDelegatee2 = await aaveInstance.getDelegateeByType(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const alicePower2 = await aaveInstance.getPowerCurrent(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const isAlice0xff2 = !(await aaveInstance.isSnapshotted(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      ));
      const bobDelegatee2 = await aaveInstance.getDelegateeByType(
        Bob.address,
        DelegationType.PROPOSITION_POWER
      );
      const bobPower2 = await aaveInstance.getPowerCurrent(
        Bob.address,
        DelegationType.PROPOSITION_POWER
      );
      const isBob0xff2 = !(await aaveInstance.isSnapshotted(
        Bob.address,
        DelegationType.PROPOSITION_POWER
      ));

      expect(alicePower2).to.be.eq(0);
      expect(bobPower2).to.be.eq(0);
      expect(isAlice0xff2).to.be.eq(true);
      expect(isBob0xff2).to.be.eq(true);
      expect(aliceDelegatee2).to.be.eq(Alice.address);
      expect(bobDelegatee2).to.be.eq(Bob.address);
    });

    it('Alice transfer funds to herself. from and to delegatee are same, skip turning off.', async () => {
      await evmRevert(snapFundedV2);
      snapFundedV2 = await evmSnapshot();

      await aaveInstance.connect(Alice.signer).transfer(Alice.address, aaveAmount);

      const power = await aaveInstance.getPowerCurrent(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const delegatee = await aaveInstance.getDelegateeByType(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const isAlice0xff = !(await aaveInstance.isSnapshotted(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      ));

      expect(delegatee).to.be.eq(Alice.address);
      expect(power).to.be.eq(aaveAmount);
      expect(isAlice0xff).to.be.eq(false);
    });

    it('Alice delegate to Bob, then to 0x00', async () => {
      await evmRevert(snapFundedV2);
      snapFundedV2 = await evmSnapshot();

      // Delegate to Bob
      await waitForTx(await aaveInstance.connect(Alice.signer).delegate(Bob.address));

      const delegatee2 = await aaveInstance.getDelegateeByType(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const alicePower2 = await aaveInstance.getPowerCurrent(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const bobPower2 = await aaveInstance.getPowerCurrent(
        Bob.address,
        DelegationType.PROPOSITION_POWER
      );
      expect(alicePower2).to.be.eq(0);
      expect(bobPower2).to.be.eq(aaveAmount.mul(2));
      expect(delegatee2).to.be.eq(Bob.address);

      // Delegate to 0x00
      await waitForTx(await aaveInstance.connect(Alice.signer).delegate(ZERO_ADDRESS));

      const delegatee3 = await aaveInstance.getDelegateeByType(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const alicePower3 = await aaveInstance.getPowerCurrent(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const bobPower3 = await aaveInstance.getPowerCurrent(
        Bob.address,
        DelegationType.PROPOSITION_POWER
      );
      const isAlice0xff = !(await aaveInstance.isSnapshotted(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      ));
      const isBob0xff = !(await aaveInstance.isSnapshotted(
        Bob.address,
        DelegationType.PROPOSITION_POWER
      ));
      expect(alicePower3).to.be.eq(0);
      expect(bobPower3).to.be.eq(0);
      expect(isAlice0xff).to.be.eq(true);
      expect(isBob0xff).to.be.eq(true);
      expect(delegatee3).to.be.eq(Alice.address);
    });

    it('Bob delegates to himself, Alice delegate to Bob, then Alice delegates to 0x00', async () => {
      await evmRevert(snapFundedV2);
      snapFundedV2 = await evmSnapshot();

      // Bob delegates to himself. This is because he would otherwise be reset.
      await waitForTx(await aaveInstance.connect(Bob.signer).delegate(Bob.address));

      // Check values before any actions
      const delegatee1 = await aaveInstance.getDelegateeByType(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const alicePower1 = await aaveInstance.getPowerCurrent(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const bobPower1 = await aaveInstance.getPowerCurrent(
        Bob.address,
        DelegationType.PROPOSITION_POWER
      );
      expect(delegatee1).to.be.eq(Alice.address);
      expect(alicePower1).to.be.eq(aaveAmount);
      expect(bobPower1).to.be.eq(aaveAmount);

      // Delegate to Bob
      await waitForTx(await aaveInstance.connect(Alice.signer).delegate(Bob.address));

      const delegatee2 = await aaveInstance.getDelegateeByType(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const alicePower2 = await aaveInstance.getPowerCurrent(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const bobPower2 = await aaveInstance.getPowerCurrent(
        Bob.address,
        DelegationType.PROPOSITION_POWER
      );
      expect(alicePower2).to.be.eq(0);
      expect(bobPower2).to.be.eq(aaveAmount.mul(2));
      expect(delegatee2).to.be.eq(Bob.address);

      // Delegate to 0x00
      await waitForTx(await aaveInstance.connect(Alice.signer).delegate(ZERO_ADDRESS));

      const delegatee3 = await aaveInstance.getDelegateeByType(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const alicePower3 = await aaveInstance.getPowerCurrent(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const bobPower3 = await aaveInstance.getPowerCurrent(
        Bob.address,
        DelegationType.PROPOSITION_POWER
      );
      const isAlice0xff = !(await aaveInstance.isSnapshotted(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      ));
      expect(alicePower3).to.be.eq(0);
      expect(bobPower3).to.be.eq(aaveAmount);
      expect(isAlice0xff).to.be.eq(true);
      expect(delegatee3).to.be.eq(Alice.address);
    });

    it('Alice delegate to 0x00, then delegate to herself', async () => {
      await evmRevert(snapFundedV2);
      snapFundedV2 = await evmSnapshot();

      await aaveInstance.connect(Alice.signer).delegate(ZERO_ADDRESS);
      await aaveInstance.connect(Alice.signer).delegate(Alice.address);

      const power = await aaveInstance.getPowerCurrent(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      expect(power).to.be.eq(aaveAmount);
    });

    it('PoorTom delegate to Alice. Bob transfer funds to PoorTom. PoorTom transfer funds to Bob', async () => {});

    it('PoorTom delegate to Alice. Bob transfer funds to PoorTom', async () => {
      await evmRevert(snapFundedV2);
      snapFundedV2 = await evmSnapshot();

      const alicePropPower0 = await aaveInstance.getPowerCurrent(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const tomPropPower0 = await aaveInstance.getPowerCurrent(
        PoorTom.address,
        DelegationType.PROPOSITION_POWER
      );
      expect(alicePropPower0.add(tomPropPower0)).to.be.eq(aaveAmount);

      await aaveInstance
        .connect(PoorTom.signer)
        .delegateByType(Alice.address, DelegationType.PROPOSITION_POWER);

      const aliceIsOff1 = !(await aaveInstance.isSnapshotted(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      ));
      const isTomOff1 = !(await aaveInstance.isSnapshotted(
        PoorTom.address,
        DelegationType.PROPOSITION_POWER
      ));

      expect(aliceIsOff1).to.be.eq(false);
      expect(isTomOff1).to.be.eq(false);

      const alicePropPower1 = await aaveInstance.getPowerCurrent(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );
      const tomPropPower1 = await aaveInstance.getPowerCurrent(
        PoorTom.address,
        DelegationType.PROPOSITION_POWER
      );

      expect(alicePropPower1.add(tomPropPower1)).to.be.eq(aaveAmount);

      expect(
        await aaveInstance.getDelegateeByType(PoorTom.address, DelegationType.PROPOSITION_POWER)
      ).to.be.eq(Alice.address);

      await aaveInstance.connect(Bob.signer).transfer(PoorTom.address, aaveAmount);
      expect(
        await aaveInstance.getDelegateeByType(PoorTom.address, DelegationType.PROPOSITION_POWER)
      ).to.be.eq(Alice.address);

      const alicePropPower2 = await aaveInstance.getPowerCurrent(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      );

      const poorTomPropPower2 = await aaveInstance.getPowerCurrent(
        PoorTom.address,
        DelegationType.PROPOSITION_POWER
      );
      expect(alicePropPower2).to.be.eq(aaveAmount.mul(2));
      expect(poorTomPropPower2).to.be.eq(0);
      expect(alicePropPower2.add(poorTomPropPower2)).to.be.eq(aaveAmount.mul(2));

      const aliceIsOff2 = !(await aaveInstance.isSnapshotted(
        Alice.address,
        DelegationType.PROPOSITION_POWER
      ));
      const isTomOff2 = !(await aaveInstance.isSnapshotted(
        PoorTom.address,
        DelegationType.PROPOSITION_POWER
      ));
      const isBobOff2 = !(await aaveInstance.isSnapshotted(
        Bob.address,
        DelegationType.PROPOSITION_POWER
      ));

      expect(aliceIsOff2).to.be.eq(false);
      expect(isTomOff2).to.be.eq(false);
      expect(isBobOff2).to.be.eq(true);
    });
  });

  describe('Combinatorics', async () => {
    // In here we will make every combination for 4 users,
    // each have will delegate to 0x00 or one of the 4 users.

    const expectedPower = (
      delegateTo: string[],
      abcd: number[],
      balances: BigNumber[],
      offset = 1
    ) => {
      const power: {[key: string]: BigNumber} = {};
      const maybePower: {[key: string]: BigNumber} = {};
      for (let i = 0; i < 4; i++) {
        const userAddress = delegateTo[i + offset];
        power[userAddress] = BigNumber.from(0);
        maybePower[userAddress] = BigNumber.from(0);
      }
      for (let i = 0; i < 4; i++) {
        if (abcd[i] > 0) {
          const delegatee = delegateTo[abcd[i]];
          power[delegatee] = power[delegatee].add(balances[i]);
        } else {
          const delegatee = delegateTo[i + offset];
          maybePower[delegatee] = maybePower[delegatee].add(balances[i]);
        }
      }
      const totPower: {[key: string]: BigNumber} = {};
      for (let i = 0; i < 4; i++) {
        let userAddress = delegateTo[i + offset];
        if (power[userAddress].gt(0)) {
          totPower[userAddress] = power[userAddress].add(maybePower[userAddress]);
        } else {
          totPower[userAddress] = BigNumber.from(0);
        }
      }
      return totPower;
    };

    it('Check every delegation combination with the 4 users, then Transfers from Alice to Bob', async () => {
      await evmRevert(snapFundedV2);
      snapFundedV2 = await evmSnapshot();

      const delegateTo = [ZERO_ADDRESS, Alice.address, Bob.address, Charlie.address, Diane.address];

      let people = [Alice, Bob, Charlie, Diane];

      for (let a = 0; a < delegateTo.length; a++) {
        for (let b = 0; b < delegateTo.length; b++) {
          for (let c = 0; c < delegateTo.length; c++) {
            for (let d = 0; d < delegateTo.length; d++) {
              const snap = await evmSnapshot();

              await aaveInstance.connect(Alice.signer).delegate(delegateTo[a]);
              await aaveInstance.connect(Bob.signer).delegate(delegateTo[b]);
              await aaveInstance.connect(Charlie.signer).delegate(delegateTo[c]);
              await aaveInstance.connect(Diane.signer).delegate(delegateTo[d]);

              // Expected proposition power:
              const userExpectedPowerBefore = expectedPower(
                delegateTo,
                [a, b, c, d],
                [aaveAmount, aaveAmount, aaveAmount, aaveAmount]
              );

              for (let i = 0; i < 4; i++) {
                let power = await aaveInstance.getPowerCurrent(
                  people[i].address,
                  DelegationType.PROPOSITION_POWER
                );
                expect(power).to.be.eq(userExpectedPowerBefore[people[i].address]);
              }

              // Then we can do a transfer. Alice -> Bob should hit every possibility when we have been the entire way round
              const transferAmount = parseEther('1');
              await aaveInstance.connect(Alice.signer).transfer(Bob.address, transferAmount);

              const userExpectedPowerAfter = expectedPower(
                delegateTo,
                [a, b, c, d],
                [
                  aaveAmount.sub(transferAmount),
                  aaveAmount.add(transferAmount),
                  aaveAmount,
                  aaveAmount,
                ]
              );

              for (let i = 0; i < 4; i++) {
                let power = await aaveInstance.getPowerCurrent(
                  people[i].address,
                  DelegationType.VOTING_POWER
                );

                expect(power).to.be.eq(userExpectedPowerAfter[people[i].address]);
              }
              await evmRevert(snap);
            }
          }
        }
      }
    });

    it('Check every proposition-delegation combination with the 4 users, then Transfers from Alice to Bob', async () => {
      await evmRevert(snapFundedV2);
      snapFundedV2 = await evmSnapshot();

      const delegateTo = [ZERO_ADDRESS, Alice.address, Bob.address, Charlie.address, Diane.address];
      let people = [Alice, Bob, Charlie, Diane];

      for (let a = 0; a < delegateTo.length; a++) {
        for (let b = 0; b < delegateTo.length; b++) {
          for (let c = 0; c < delegateTo.length; c++) {
            for (let d = 0; d < delegateTo.length; d++) {
              const snap = await evmSnapshot();

              await aaveInstance
                .connect(Alice.signer)
                .delegateByType(delegateTo[a], DelegationType.PROPOSITION_POWER);
              await aaveInstance
                .connect(Bob.signer)
                .delegateByType(delegateTo[b], DelegationType.PROPOSITION_POWER);
              await aaveInstance
                .connect(Charlie.signer)
                .delegateByType(delegateTo[c], DelegationType.PROPOSITION_POWER);
              await aaveInstance
                .connect(Diane.signer)
                .delegateByType(delegateTo[d], DelegationType.PROPOSITION_POWER);

              // Expected proposition power:
              const userExpectedPowerBefore = expectedPower(
                delegateTo,
                [a, b, c, d],
                [aaveAmount, aaveAmount, aaveAmount, aaveAmount]
              );

              for (let i = 0; i < 4; i++) {
                let power = await aaveInstance.getPowerCurrent(
                  people[i].address,
                  DelegationType.PROPOSITION_POWER
                );
                expect(power).to.be.eq(userExpectedPowerBefore[people[i].address]);
              }

              // Then we can do a transfer. Alice -> Bob should hit every possibility when we have been the entire way round
              const transferAmount = parseEther('1');
              await aaveInstance.connect(Alice.signer).transfer(Bob.address, transferAmount);

              const userExpectedPowerAfter = expectedPower(
                delegateTo,
                [a, b, c, d],
                [
                  aaveAmount.sub(transferAmount),
                  aaveAmount.add(transferAmount),
                  aaveAmount,
                  aaveAmount,
                ]
              );

              for (let i = 0; i < 4; i++) {
                let power = await aaveInstance.getPowerCurrent(
                  people[i].address,
                  DelegationType.PROPOSITION_POWER
                );

                expect(power).to.be.eq(userExpectedPowerAfter[people[i].address]);
              }
              await evmRevert(snap);
            }
          }
        }
      }
    });

    it('Check every voting-delegation combination with the 4 users, then Transfers from Alice to Bob', async () => {
      await evmRevert(snapFundedV2);
      snapFundedV2 = await evmSnapshot();

      const delegateTo = [ZERO_ADDRESS, Alice.address, Bob.address, Charlie.address, Diane.address];
      let people = [Alice, Bob, Charlie, Diane];

      for (let a = 0; a < delegateTo.length; a++) {
        for (let b = 0; b < delegateTo.length; b++) {
          for (let c = 0; c < delegateTo.length; c++) {
            for (let d = 0; d < delegateTo.length; d++) {
              const snap = await evmSnapshot();

              await aaveInstance
                .connect(Alice.signer)
                .delegateByType(delegateTo[a], DelegationType.VOTING_POWER);
              await aaveInstance
                .connect(Bob.signer)
                .delegateByType(delegateTo[b], DelegationType.VOTING_POWER);
              await aaveInstance
                .connect(Charlie.signer)
                .delegateByType(delegateTo[c], DelegationType.VOTING_POWER);
              await aaveInstance
                .connect(Diane.signer)
                .delegateByType(delegateTo[d], DelegationType.VOTING_POWER);

              // Expected proposition power:
              const userExpectedPowerBefore = expectedPower(
                delegateTo,
                [a, b, c, d],
                [aaveAmount, aaveAmount, aaveAmount, aaveAmount]
              );

              for (let i = 0; i < 4; i++) {
                let power = await aaveInstance.getPowerCurrent(
                  people[i].address,
                  DelegationType.VOTING_POWER
                );
                expect(power).to.be.eq(userExpectedPowerBefore[people[i].address]);
              }

              // Then we can do a transfer. Alice -> Bob should hit every possibility when we have been the entire way round
              const transferAmount = parseEther('1');
              await aaveInstance.connect(Alice.signer).transfer(Bob.address, transferAmount);

              const userExpectedPowerAfter = expectedPower(
                delegateTo,
                [a, b, c, d],
                [
                  aaveAmount.sub(transferAmount),
                  aaveAmount.add(transferAmount),
                  aaveAmount,
                  aaveAmount,
                ]
              );

              for (let i = 0; i < 4; i++) {
                let power = await aaveInstance.getPowerCurrent(
                  people[i].address,
                  DelegationType.VOTING_POWER
                );

                expect(power).to.be.eq(userExpectedPowerAfter[people[i].address]);
              }
              await evmRevert(snap);
            }
          }
        }
      }
    });
  });
});
