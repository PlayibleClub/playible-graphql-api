import * as nearAPI from 'near-api-js';
const { keyStores, KeyPair, connect } = nearAPI;
import { SportType } from './utils/types';
export const setup = async () => {
  const keyStore = new keyStores.InMemoryKeyStore();
  const keyPair = KeyPair.fromString(process.env.NEAR_PRIVATE_KEY_WALLET || '');
  await keyStore.setKey(
    process.env.NEAR_NETWORK_ID ? process.env.NEAR_NETWORK_ID : 'testnet',
    process.env.NEAR_MAIN_ACCOUNT_ID
      ? process.env.NEAR_MAIN_ACCOUNT_ID
      : 'playible.testnet',
    keyPair
  );

  const config: any = {
    networkId: process.env.NEAR_NETWORK_ID,
    keyStore,
    nodeUrl: `https://rpc.${process.env.NEAR_NETWORK_ID}.near.org`,
    walletUrl: `https://wallet.${process.env.NEAR_NETWORK_ID}.near.org`,
    helperUrl: `https://helper.${process.env.NEAR_NETWORK_ID}.near.org`,
    explorerUrl: `https://explorer.${process.env.NEAR_NETWORK_ID}.near.org`,
  };

  const near = await connect(config);
  return near;
};

export const changeAthleteMetadataSetup = async (
  sport: SportType
  //isPromo: boolean
) => {
  const keyStore = new keyStores.InMemoryKeyStore();
  let keyString: string = '';
  let accountId = '';
  switch (sport) {
    case SportType.NFL:
      keyString = process.env.NEAR_NFL_KEY || '';
      accountId = process.env.NEAR_NFL_ACCOUNT_ID || '';
      break;
    case SportType.NFL_PROMO:
      keyString = process.env.NEAR_NFL_PROMO_KEY || '';
      accountId = process.env.NEAR_NFL_PROMO_ACCOUNT_ID || '';
      break;
    case SportType.NBA:
      keyString = process.env.NEAR_NBA_KEY || ''; // change to specific sport var
      accountId = process.env.NEAR_NBA_ACCOUNT_ID || '';

      break;
    case SportType.NBA_PROMO:
      keyString = process.env.NEAR_NBA_PROMO_KEY || '';
      accountId = process.env.NEAR_NBA_PROMO_ACCOUNT_ID || '';
      break;
    case SportType.MLB:
      keyString = process.env.NEAR_MLB_KEY || '';
      accountId = process.env.NEAR_MLB_ACCOUNT_ID || '';
      break;
    case SportType.MLB_PROMO:
      keyString = process.env.NEAR_MLB_PROMO_KEY || '';
      accountId = process.env.NEAR_MLB_PROMO_ACCOUNT_ID || '';
      break;
    default:
      break;
  }
  const keyPair = KeyPair.fromString(keyString);
  await keyStore.setKey(
    process.env.NEAR_NETWORK_ID ? process.env.NEAR_NETWORK_ID : 'testnet',
    accountId,
    keyPair
  );
  const config: any = {
    networkId: process.env.NEAR_NETWORK_ID,
    keyStore,
    nodeUrl: `https://rpc.${process.env.NEAR_NETWORK_ID}.near.org`,
    walletUrl: `https://wallet.${process.env.NEAR_NETWORK_ID}.near.org`,
    helperUrl: `https://helper.${process.env.NEAR_NETWORK_ID}.near.org`,
    explorerUrl: `https://explorer.${process.env.NEAR_NETWORK_ID}.near.org`,
  };
  const near = await connect(config);
  return near;
};
