/**
 * wire.js — Run this ONCE to wire up already-deployed contracts.
 * Use this after a partial deploy where contracts were deployed but wiring failed.
 *
 * Usage:
 *   npx hardhat run scripts/wire.js --network sepolia
 */

const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

async function main() {
  const { ethers } = hre;
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const deployerAddr = await deployer.getAddress();

  console.log("Deployer:", deployerAddr);

  // Load addresses from deployments.json
  const depPath = path.join(__dirname, "..", "deployments.json");
  if (!fs.existsSync(depPath)) {
    throw new Error("deployments.json not found — run deploy:sepolia first");
  }
  const dep = JSON.parse(fs.readFileSync(depPath, "utf8"));
  const { PokeToken, PokeWorldNFT, PokeEvolution } = dep.contracts;

  console.log("PokeToken    :", PokeToken);
  console.log("PokeWorldNFT :", PokeWorldNFT);
  console.log("PokeEvolution:", PokeEvolution);

  // Minimal human-readable ABIs — no resolveName involved
  const nftAbi = [
    "function setEvolver(address) external",
    "function setMinter(address, bool) external"
  ];
  const tokenAbi = [
    "function setMinter(address, bool) external"
  ];

  const nft       = new ethers.Contract(PokeWorldNFT, nftAbi,   deployer);
  const pokeToken = new ethers.Contract(PokeToken,    tokenAbi, deployer);

  // Wire 1: PokeEvolution can call evolve() on the NFT
  console.log("\nSetting evolver...");
  const tx1 = await nft.setEvolver(PokeEvolution);
  await tx1.wait();
  console.log("  ✓ NFT.setEvolver(PokeEvolution)");

  // Wire 2: Deployer can mint starter NFTs
  console.log("Setting NFT minter...");
  const tx2 = await nft.setMinter(deployerAddr, true);
  await tx2.wait();
  console.log("  ✓ NFT.setMinter(deployer)");

  // Wire 3: Deployer can award POKE tokens
  console.log("Setting token minter...");
  const tx3 = await pokeToken.setMinter(deployerAddr, true);
  await tx3.wait();
  console.log("  ✓ PokeToken.setMinter(deployer)");

  console.log("\n✅ All contracts wired successfully!");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
