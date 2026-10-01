import fs from "node:fs";
import path from "node:path";
import solc from "solc";

const root = process.cwd();
const sourcePath = path.join(root, "contracts", "SplitFlowSettlement.sol");
const outputDir = path.join(root, "lib", "generated");
const outputPath = path.join(outputDir, "SplitFlowSettlement.json");

const source = fs.readFileSync(sourcePath, "utf8");

const input = {
  language: "Solidity",
  sources: {
    "SplitFlowSettlement.sol": { content: source },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors || []).filter((item) => item.severity === "error");

if (errors.length) {
  throw new Error(errors.map((item) => item.formattedMessage).join("\n"));
}

const contract =
  output.contracts?.["SplitFlowSettlement.sol"]?.["SplitFlowSettlement"];

if (!contract?.evm?.bytecode?.object) {
  throw new Error("SplitFlowSettlement bytecode was not generated");
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  outputPath,
  JSON.stringify(
    {
      contractName: "SplitFlowSettlement",
      abi: contract.abi,
      bytecode: "0x" + contract.evm.bytecode.object,
    },
    null,
    2,
  ) + "\n",
);

console.log("Compiled SplitFlowSettlement -> " + outputPath);
