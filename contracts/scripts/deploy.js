/**
 * deploy.js — PokéWorld full deployment script
 *
 * Deployment order (dependencies must be deployed first):
 *   1.  PokeToken       (no deps)
 *   2.  PokeWorldNFT    (no deps)
 *   3.  PokeEvolution   (needs PokeWorldNFT + PokeToken)
 *   4.  PokeMarketplace (needs PokeWorldNFT + PokeToken)
 *
 * Post-deployment wiring:
 *   • PokeWorldNFT.setMinter(PokeEvolution)     — lets Evolution award XP / evolve
 *   • PokeWorldNFT.setMinter(deployer)          — deployer can mint starter NFTs
 *   • PokeToken.setMinter(deployer)             — deployer can reward tokens in-game
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network sepolia
 *   npx hardhat run scripts/deploy.js --network mainnet
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("─".repeat(60));
  console.log("PokéWorld Contracts — Deployment Script");
  console.log("─".repeat(60));
  console.log("Deployer  :", deployer.address);
  console.log("Balance   :", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH/MATIC");
  console.log("Network   :", (await ethers.provider.getNetwork()).name);
  console.log("─".repeat(60));

  /* ── 1. PokeToken (ERC-20) ─────────────────────────────── */
  console.log("\n[1/4] Deploying PokeToken…");
  const PokeToken = await ethers.getContractFactory("PokeToken");
  const pokeToken = await PokeToken.deploy();
  await pokeToken.waitForDeployment();
  const pokeTokenAddr = await pokeToken.getAddress();
  console.log("      ✅ PokeToken:", pokeTokenAddr);

  /* ── 2. PokeWorldNFT (ERC-721) ─────────────────────────── */
  console.log("\n[2/4] Deploying PokeWorldNFT…");
  const PokeWorldNFT = await ethers.getContractFactory("PokeWorldNFT");
  const nft = await PokeWorldNFT.deploy();
  await nft.waitForDeployment();
  const nftAddr = await nft.getAddress();
  console.log("      ✅ PokeWorldNFT:", nftAddr);

  /* ── 3. PokeEvolution ──────────────────────────────────── */
  console.log("\n[3/4] Deploying PokeEvolution…");
  const PokeEvolution = await ethers.getContractFactory("PokeEvolution");
  const evolution = await PokeEvolution.deploy(nftAddr, pokeTokenAddr);
  await evolution.waitForDeployment();
  const evolutionAddr = await evolution.getAddress();
  console.log("      ✅ PokeEvolution:", evolutionAddr);

  /* ── 4. PokeMarketplace ─────────────────────────────────── */
  // feeRecipient = deployer (change to a treasury multi-sig in production)
  console.log("\n[4/4] Deploying PokeMarketplace…");
  const PokeMarketplace = await ethers.getContractFactory("PokeMarketplace");
  const marketplace = await PokeMarketplace.deploy(nftAddr, pokeTokenAddr, deployer.address);
  await marketplace.waitForDeployment();
  const marketplaceAddr = await marketplace.getAddress();
  console.log("      ✅ PokeMarketplace:", marketplaceAddr);

  /* ── Post-deployment wiring ─────────────────────────────── */
  console.log("\n── Wiring contracts…");

  // Allow PokeEvolution to call evolve() and addExperience() on the NFT
  let tx = await nft.setEvolver(evolutionAddr);
  await tx.wait();
  console.log("  ✓ NFT.setEvolver(PokeEvolution)");

  // Allow deployer to mint starter Pokémon
  tx = await nft.setMinter(deployer.address, true);
  await tx.wait();
  console.log("  ✓ NFT.setMinter(deployer)");

  // Allow deployer to issue POKE tokens (e.g. for battle rewards)
  tx = await pokeToken.setMinter(deployer.address, true);
  await tx.wait();
  console.log("  ✓ PokeToken.setMinter(deployer)");

  /* ── Save addresses ────────────────────────────────────── */
  const deployment = {
    network:      (await ethers.provider.getNetwork()).name,
    chainId:      Number((await ethers.provider.getNetwork()).chainId),
    deployer:     deployer.address,
    deployedAt:   new Date().toISOString(),
    contracts: {
      PokeToken:       pokeTokenAddr,
      PokeWorldNFT:    nftAddr,
      PokeEvolution:   evolutionAddr,
      PokeMarketplace: marketplaceAddr,
    },
  };

  const outPath = path.join(__dirname, "..", "deployments.json");
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log("\n── Addresses saved to deployments.json");

  /* ── Summary ───────────────────────────────────────────── */
  console.log("\n" + "─".repeat(60));
  console.log("DEPLOYMENT COMPLETE");
  console.log("─".repeat(60));
  console.log("PokeToken       :", pokeTokenAddr);
  console.log("PokeWorldNFT    :", nftAddr);
  console.log("PokeEvolution   :", evolutionAddr);
  console.log("PokeMarketplace :", marketplaceAddr);
  console.log("─".repeat(60));
  console.log("\nNext steps:");
  console.log("  1. Verify contracts:   npx hardhat verify --network sepolia <address>");
  console.log("  2. Set baseMetadataURI on PokeEvolution (IPFS CID)");
  console.log("  3. Update js/config.js with contract addresses");
  console.log("  4. Get Sepolia ETH from https://sepoliafaucet.com");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
