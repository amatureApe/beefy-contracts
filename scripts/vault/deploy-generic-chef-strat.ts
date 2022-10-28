import hardhat, { ethers, web3 } from "hardhat";
import { addressBook } from "blockchain-addressbook";
import { predictAddresses } from "../../utils/predictAddresses";
import { setPendingRewardsFunctionName } from "../../utils/setPendingRewardsFunctionName";
import { verifyContract } from "../../utils/verifyContract";

const registerSubsidy = require("../../utils/registerSubsidy");

const {
  platforms: { spookyswap, beefyfinance },
  tokens: {
    DEUS: { address: DEUS },
    WFTM: { address: WFTM },
    DEI: { address: DEI },
    USDC: { address: USDC },
    BOO: { address: BOO }
  },
} = addressBook.fantom;

const shouldVerifyOnEtherscan = true;

const want = web3.utils.toChecksumAddress("0x91f7120898b4be26cC1e84F421e76725c07d1361");
const ensId = ethers.utils.formatBytes32String("boo.eth");

const vaultParams = {
  mooName: "Moo Boo USDC-DEI",
  mooSymbol: "mooBooUSDC-DEI",
  delay: 21600,
};

const strategyParams = {
  want: want,
  poolId: 2,
  chef: "0x9C9C920E51778c4ABF727b8Bb223e78132F00aA4",
  unirouter: "0xF491e7B69E4244ad4002BC14e878a34207E38c29",
  strategist: process.env.STRATEGIST_ADDRESS,
  keeper: beefyfinance.keeper,
  beefyFeeRecipient: beefyfinance.beefyFeeRecipient,
  beefyFeeConfig: beefyfinance.beefyFeeConfig,
  outputToNativeRoute: [DEUS, WFTM],
  secondOutputToNativeRoute: [BOO, WFTM],
  outputToLp0Route: [WFTM, USDC],
  outputToLp1Route: [WFTM, USDC, "0xDE1E704dae0B4051e80DAbB26ab6ad6c12262DA0"],
  ensId,
  shouldSetPendingRewardsFunctionName: false,
  pendingRewardsFunctionName: "pendingToken", // used for rewardsAvailable(), use correct function name from masterchef
};

const contractNames = {
  vault: "BeefyVaultV6",
  strategy: "StrategySpookyV2LP",
};

async function main() {
  if (
    Object.values(vaultParams).some(v => v === undefined) ||
    Object.values(strategyParams).some(v => v === undefined) ||
    Object.values(contractNames).some(v => v === undefined)
  ) {
    console.error("one of config values undefined");
    return;
  }

  await hardhat.run("compile");

  const Vault = await ethers.getContractFactory(contractNames.vault);
  const Strategy = await ethers.getContractFactory(contractNames.strategy);

  const [deployer] = await ethers.getSigners();

  console.log("Deploying:", vaultParams.mooName);

  const predictedAddresses = await predictAddresses({ creator: deployer.address });
  console.log("Predicted Addresses: ", predictedAddresses)

  const vaultConstructorArguments = [
    predictedAddresses.strategy,
    vaultParams.mooName,
    vaultParams.mooSymbol,
    vaultParams.delay,
  ];

  const vault = await Vault.deploy(...vaultConstructorArguments);

  await vault.deployed();

  const strategyConstructorArguments = [
    strategyParams.want,
    strategyParams.poolId,
    strategyParams.chef,
    [vault.address,
    strategyParams.unirouter,
    strategyParams.keeper,
    strategyParams.strategist,
    strategyParams.beefyFeeRecipient,
    strategyParams.beefyFeeConfig],
    strategyParams.outputToNativeRoute,
    strategyParams.secondOutputToNativeRoute,
    strategyParams.outputToLp0Route,
    strategyParams.outputToLp1Route
  ];
  console.log("PING", strategyConstructorArguments)
  const strategy = await Strategy.deploy(...strategyConstructorArguments);
  // console.log("PING4", strategy)
  console.log("PING4", process.env.API_KEY)

  await strategy.deployed();

  console.log("PING5")


  // add this info to PR
  console.log();
  console.log("Vault:", vault.address);
  console.log("Strategy:", strategy.address);
  console.log("Want:", strategyParams.want);
  console.log("PoolId:", strategyParams.poolId);

  console.log();
  console.log("Running post deployment");

  const verifyContractsPromises: Promise<any>[] = [];
  console.log(process.env.API_KEY)
  if (shouldVerifyOnEtherscan) {
    // skip await as this is a long running operation, and you can do other stuff to prepare vault while this finishes
    verifyContractsPromises.push(
      verifyContract(vault.address, vaultConstructorArguments),
      verifyContract(strategy.address, strategyConstructorArguments)
    );
  }

  if (strategyParams.shouldSetPendingRewardsFunctionName) {
    await setPendingRewardsFunctionName(strategy, strategyParams.pendingRewardsFunctionName);
  }

  console.log(`Transfering Vault Owner to ${beefyfinance.vaultOwner}`)
  await vault.transferOwnership(beefyfinance.vaultOwner);
  console.log();

  await Promise.all(verifyContractsPromises);

  if (hardhat.network.name === "fantom") {
    await registerSubsidy(vault.address, deployer);
    await registerSubsidy(strategy.address, deployer);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });