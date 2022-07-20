const { LOCALHOST, tmpLedgerDir } = require('@metaplex-foundation/amman');
const path = require('path');
const MOCK_STORAGE_ID = 'js-next-sdk';

function localDeployPath(programName) {
  return path.join(__dirname, 'target', 'deploy', `${programName}.so`);
}

const programIds = {
  metadata: 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
  postbox: 'Fs5wSa7GYtTqivXGqHyx673v5oPuD5Cb7ij9utsFKdLb',
  vault: 'vau1zxA2LbssAUEF7Gpw91zMM1LvXrvpzJtmZ58rPsn',
  auction: 'auctxRXPeJoc4817jDhf4HbjnhEcr1cCXenosMhK5R8',
  metaplex: 'p1exdMJcjVao65QdewkaZRUnU6VPSXhus9n2GzWfh98',
  fixedPriceSaleToken: 'SaLeTjyUa5wXHnGuewUSyJ5JWZaHwz3TxqUntCE9czo',
  candyMachine: 'cndy3Z4yapfJBmL3ShUp5exZKqR3z33thTzeNMm2gRZ',
  auctionHouse: 'hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk',
};

const programs = [
  {
    label: 'Postbox',
    programId: programIds.postbox,
    deployPath: localDeployPath('postbox')
  }
];

module.exports = {
  validator: {
    killRunningValidators: true,
    programs,
    jsonRpcUrl: LOCALHOST,
    websocketUrl: '',
    commitment: 'confirmed',
    ledgerDir: tmpLedgerDir(),
    resetLedger: true,
    verifyFees: false,
  },
  storage: {
    storageId: MOCK_STORAGE_ID,
    clearOnStart: true,
  },
  snapshot: {
    snapshotFolder: path.join(__dirname, 'snapshots'),
  },
  relay: {
    enabled: true
  }
};
