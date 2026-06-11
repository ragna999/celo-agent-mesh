const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "CELO");

  // 1. Deploy AgentRegistry
  console.log("\n--- Deploying AgentRegistry ---");
  const Registry = await hre.ethers.getContractFactory("AgentRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("AgentRegistry:", registryAddr);

  // 2. Deploy AgentPayments
  console.log("\n--- Deploying AgentPayments ---");
  const Payments = await hre.ethers.getContractFactory("AgentPayments");
  const payments = await Payments.deploy(deployer.address, registryAddr);
  await payments.waitForDeployment();
  const paymentsAddr = await payments.getAddress();
  console.log("AgentPayments:", paymentsAddr);

  // 3. Deploy AgentMessenger
  console.log("\n--- Deploying AgentMessenger ---");
  const Messenger = await hre.ethers.getContractFactory("AgentMessenger");
  const messenger = await Messenger.deploy(registryAddr);
  await messenger.waitForDeployment();
  const messengerAddr = await messenger.getAddress();
  console.log("AgentMessenger:", messengerAddr);

  // 4. Print summary
  console.log("\n====================================");
  console.log("DEPLOYMENT COMPLETE");
  console.log("====================================");
  console.log("Network:", hre.network.name);
  console.log("AgentRegistry:", registryAddr);
  console.log("AgentPayments:", paymentsAddr);
  console.log("AgentMessenger:", messengerAddr);
  console.log("====================================\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
