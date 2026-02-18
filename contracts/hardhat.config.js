require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY   = process.env.DEPLOYER_PRIVATE_KEY || "0x" + "0".repeat(64);
const SEPOLIA_RPC   = process.env.SEPOLIA_RPC_URL      || "https://rpc.sepolia.org";
const ETH_RPC       = process.env.ETH_RPC_URL          || "https://mainnet.infura.io/v3/YOUR_KEY";
const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY    || "";

/** @type import("hardhat/config").HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    // Sepolia Testnet
    sepolia: {
      url:      SEPOLIA_RPC,
      accounts: [PRIVATE_KEY],
      chainId:  11155111,
    },
    // Ethereum Mainnet
    mainnet: {
      url:      ETH_RPC,
      accounts: [PRIVATE_KEY],
      chainId:  1,
    },
  },
  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_KEY,
      sepolia: ETHERSCAN_KEY,
    },
  },
  gasReporter: {
    enabled:  process.env.REPORT_GAS === "true",
    currency: "USD",
  },
  paths: {
    sources:   "./src",         // solidity source files (see below)
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },
};
