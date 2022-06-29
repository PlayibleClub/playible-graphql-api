import * as nearAPI from "near-api-js"
const { keyStores, KeyPair, connect } = nearAPI

export const setup = async () => {
  const keyStore = new keyStores.InMemoryKeyStore()
  const keyPair = KeyPair.fromString(process.env.NEAR_PRIVATE_KEY_WALLET || "")
  await keyStore.setKey("testnet", "playible.testnet", keyPair)

  const config: any = {
    networkId: "testnet",
    keyStore,
    nodeUrl: "https://rpc.testnet.near.org",
    walletUrl: "https://wallet.testnet.near.org",
    helperUrl: "https://helper.testnet.near.org",
    explorerUrl: "https://explorer.testnet.near.org",
  }

  const near = await connect(config)
  return near
}
