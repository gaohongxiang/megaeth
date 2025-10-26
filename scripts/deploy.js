import hre from "hardhat";
const { ethers } = hre;

async function main() {
  const Contract = await ethers.getContractFactory("Pinger");
  const c = await Contract.deploy();
  await c.waitForDeployment();

  console.log("✅ PingerV2 deployed to:", await c.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
