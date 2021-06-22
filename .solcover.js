const accounts = require(`./test-wallets.js`).accounts;

module.exports = {
  skipFiles: ["open-zeppelin/", "mocks/"],
  mocha: {
    enableTimeouts: false,
    grep: "@fork-mode",
    invert: true
  },
  providerOptions: {
    accounts,
    _chainId: 1337,
    _chainIdRpc: 1337,
    network_id: 1337,
  },
};
