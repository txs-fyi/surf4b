const cors = require("cors");
const morgan = require("morgan");
const express = require("express");

const { ethers } = require("ethers");
const { fourByteTracer } = require("./surf4b/tracers");
const { bundle } = require("./surf4b/utils");
const { ETH_MAINNET_RPC_URL } = require("./surf4b/constants");

/*

In memory database for the last 100 blocks:

{
    'blocks': {
        '1': {
            'txHash': ['0x12345678', '0x3456789']
        }
    },
    '0x12345': {
        'txHash': count,
    },
}

*/

let lastBlock = null;
let inMemoryDatabase = {
  blocks: {},
  functionSignatures: {},
};

const provider = new ethers.providers.JsonRpcProvider(ETH_MAINNET_RPC_URL);

provider.on("block", async (blockNumber) => {
  lastBlock = blockNumber;
  const blockData = await provider.getBlock(blockNumber);
  const funcSigs = await Promise.all(
    blockData.transactions.map((x) =>
      provider.send("debug_traceTransaction", [
        x,
        { tracer: bundle(fourByteTracer) },
      ])
    )
  );

  const txHashAndFuncsigs = funcSigs
    .map((x, idx) => {
      return [blockData.transactions[idx], x];
    })
    .filter((x) => Object.keys(x[1]).length > 0);

  // Include block
  const txHashFuncSigKV = txHashAndFuncsigs.reduce((acc, x) => {
    const txHash = x[0];
    const sigs = Object.keys(x[1]);
    acc[txHash] = sigs;
    return acc;
  }, {});
  inMemoryDatabase.blocks[blockNumber] = txHashFuncSigKV;

  const txHashfuncSigCountKV = txHashAndFuncsigs.reduce((acc, x) => {
    const txHash = x[0];
    const sigs = Object.keys(x[1]);

    for (let i = 0; i < sigs.length; i++) {
      const curSig = sigs[i];
      if (!acc[curSig]) {
        acc[curSig] = {};
      }
      acc[curSig][txHash] = x[1][curSig];
    }

    return acc;
  }, inMemoryDatabase.functionSignatures);
  inMemoryDatabase.functionSignatures = txHashfuncSigCountKV;

  // Remove stale data from > 100 blocks ago
  const lastStaleBlockNumber = blockNumber - 100;
  if (inMemoryDatabase.blocks[lastStaleBlockNumber]) {
    const txHashKV = inMemoryDatabase.blocks[lastStaleBlockNumber];
    const txHashesInBlock = Object.keys(txHashKV);

    for (let i = 0; i < txHashesInBlock.length; i++) {
      const curTxHash = txHashesInBlock[i];
      const avaiFuncSigs = txHashKV[curTxHash];

      for (let j = 0; j < avaiFuncSigs.length; j++) {
        const curFuncSig = avaiFuncSigs[j];
        delete inMemoryDatabase.functionSignatures[curFuncSig][curTxHash];

        // Delete function signature if null
        if (
          Object.keys(inMemoryDatabase.functionSignatures[curFuncSig])
            .length === 0
        ) {
          delete inMemoryDatabase.functionSignatures[curFuncSig];
        }
      }
    }

    delete inMemoryDatabase.blocks[lastStaleBlockNumber];
  }
});

const app = express();
const port = 3002;

app.use(cors());
app.use(morgan("common"));

app.get("/", (req, res) => {
  res.json({
    lastBlock: lastBlock,
    data: inMemoryDatabase.functionSignatures,
  });
});

app.listen(port, () => {
  console.log(`surf4b listening on port ${port}`);
});
