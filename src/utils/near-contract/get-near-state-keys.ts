// file: view_state_keys.js
import { setup } from "../../near-api";

async function main() {
  const nearApi = await setup();

  const response = await nearApi.connection.provider.query({
    request_type: "view_state",
    finality: "final",
    account_id: process.env.CONTRACT_ADDRESS_FOR_STATE_CLEAR || "",
    prefix_base64: "",
  });
  console.log(
    JSON.stringify({
      // @ts-ignore:next-line
      keys: response.values.map((it) => it.key),
    })
  );
}

main().catch((reason) => {
  console.error(reason);
});
