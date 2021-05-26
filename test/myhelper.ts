import { AaveTokenV2 } from '../types/AaveTokenV2';
import { SignerWithAddress } from './helpers/make-suite';

export const getDelInfo = async (
  aaveInstance: AaveTokenV2,
  users: SignerWithAddress[],
  index: number
) => {
  console.log(
    `delegatee ${index}`,
    await aaveInstance.getDelegateeByType(users[index].address, '0'),
    await aaveInstance.getDelegateeByType(users[index].address, '1'),
    ` real ${index}`,
    await aaveInstance.getDelegateeReal(users[index].address, '0'),
    await aaveInstance.getDelegateeReal(users[index].address, '1')
  );
};
export const getPwrInfo = async (
  aaveInstance: AaveTokenV2,
  users: SignerWithAddress[],
  index: number
) => {
  console.log(
    `power ${index}`,
    (await aaveInstance.getPowerCurrent(users[index].address, '0')).toString(),
    (await aaveInstance.getPowerCurrent(users[index].address, '1')).toString()
  );
};
export const getBalInfo = async (
  aaveInstance: AaveTokenV2,
  users: SignerWithAddress[],
  index: number
) => {
  console.log(`bal ${index}`, (await aaveInstance.balanceOf(users[index].address)).toString());
};

export const getAllInfo = async (aaveInstance: AaveTokenV2, users: SignerWithAddress[]) => {
  console.log('\n')
  console.log('bals');
  await getBalInfo(aaveInstance, users, 1);
  await getBalInfo(aaveInstance, users, 2);
  await getBalInfo(aaveInstance, users, 3);
  await getBalInfo(aaveInstance, users, 4);
  await getBalInfo(aaveInstance, users, 5);
  await getBalInfo(aaveInstance, users, 6);
  console.log('dels');
  await getDelInfo(aaveInstance, users, 1);
  await getDelInfo(aaveInstance, users, 2);
  await getDelInfo(aaveInstance, users, 3);
  await getDelInfo(aaveInstance, users, 4);
  await getDelInfo(aaveInstance, users, 5);
  await getDelInfo(aaveInstance, users, 6);
  console.log('pwr');
  await getPwrInfo(aaveInstance, users, 1);
  await getPwrInfo(aaveInstance, users, 2);
  await getPwrInfo(aaveInstance, users, 3);
  await getPwrInfo(aaveInstance, users, 4);
  await getPwrInfo(aaveInstance, users, 5);
  await getPwrInfo(aaveInstance, users, 6);
};
