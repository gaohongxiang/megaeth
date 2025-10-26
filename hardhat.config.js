import 'dotenv/config';
import '@nomicfoundation/hardhat-toolbox';

const { PRIVATE_KEY, HTTP_URL, CHAIN_ID } = process.env;

export default {
    solidity: "0.8.20",
    networks: {
        megaeth: {
            url: HTTP_URL,
            chainId: Number(CHAIN_ID || 6342),
            accounts: [PRIVATE_KEY]
        }
    }
};
