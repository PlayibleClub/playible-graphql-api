import * as nearAPI from "near-api-js";
const { keyStores, KeyPair, connect } = nearAPI;

export const setup = async () => {
  const keyStore = new keyStores.InMemoryKeyStore();
  const keyPair = KeyPair.fromString(process.env.NEAR_PRIVATE_KEY_WALLET || "");
  await keyStore.setKey(
    process.env.NEAR_NETWORK_ID ? process.env.NEAR_NETWORK_ID : "testnet",
    process.env.NEAR_MAIN_ACCOUNT_ID
      ? process.env.NEAR_MAIN_ACCOUNT_ID
      : "playible.testnet",
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
