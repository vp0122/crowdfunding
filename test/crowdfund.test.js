const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");

const timeTravel = async seconds => {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
};

const getTimeStamp = async () => {
  const blockNumBefore = await ethers.provider.getBlockNumber();
  const blockBefore = await ethers.provider.getBlock(blockNumBefore);
  return blockBefore.timestamp;
};

describe("Crowdfund", function () {
  let owner, user1, user2;
  let CrowdFund, USDC;
  let startTimeStamp;

  const goal = 10000;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    let usdc = await ethers.getContractFactory("USDC");
    USDC = await usdc.deploy(100000000);
    await USDC.deployed();

    let crowdFund = await ethers.getContractFactory("CrowdFund");
    CrowdFund = await crowdFund.deploy(USDC.address, 100 * 100);
    await CrowdFund.deployed();

    startTimeStamp = await getTimeStamp();

    await USDC.transfer(user1.address, 1000000);
    await USDC.transfer(user2.address, 1000000);

    await USDC.approve(CrowdFund.address, 1000000);
    await USDC.connect(user1).approve(CrowdFund.address, 1000000);
    await USDC.connect(user2).approve(CrowdFund.address, 1000000);
  });

  describe("Launch", function () {
    it("Should revert if less than current Block Timestamp", async () => {
      await expect(
        CrowdFund.launch(goal, startTimeStamp, startTimeStamp + 3000),
      ).to.be.revertedWith("Start time is less than current Block Timestamp");
    });

    it("Should revert if end time exceeds the maximum Duration", async () => {
      timeTravel(200);
      await expect(
        CrowdFund.launch(goal, startTimeStamp + 500, startTimeStamp + 100000),
      ).to.be.revertedWith("End time exceeds the maximum Duration");
    });
  });

  describe("Deploy", function () {
    it("Fund success", async () => {
      startTimeStamp = await getTimeStamp();
      await CrowdFund.launch(goal, startTimeStamp + 100, startTimeStamp + 5000);

      await expect(CrowdFund.pledge(1, 5000)).to.be.revertedWith(
        "Campaign has not Started yet",
      );

      await expect(CrowdFund.unPledge(1, 5000)).to.be.revertedWith(
        "Campaign has not Started yet",
      );

      await timeTravel(200);

      await CrowdFund.pledge(1, 5000);
      await CrowdFund.connect(user1).pledge(1, 5000);
      await CrowdFund.connect(user2).pledge(1, 5000);
      await CrowdFund.connect(user2).unPledge(1, 1000);

      await expect(
        CrowdFund.connect(user2).unPledge(1, 6000),
      ).to.be.revertedWith("You do not have enough tokens Pledged to withraw");

      expect(await CrowdFund.getPledgeAmount(1)).to.be.greaterThan(goal);
      await expect(CrowdFund.claim(1)).to.be.revertedWith(
        "Campaign has not ended",
      );

      await timeTravel(5000);
      await CrowdFund.claim(1);
      await expect(CrowdFund.claim(1)).to.be.revertedWith("claimed");

      await expect(CrowdFund.pledge(1, 5000)).to.be.revertedWith(
        "Campaign has already ended",
      );

      await expect(CrowdFund.unPledge(1, 5000)).to.be.revertedWith(
        "Campaign has already ended",
      );
    });

    it("Fund fail", async () => {
      startTimeStamp = await getTimeStamp();
      await CrowdFund.launch(goal, startTimeStamp + 100, startTimeStamp + 5000);

      await timeTravel(200);

      await CrowdFund.pledge(1, 2000);
      await CrowdFund.connect(user1).pledge(1, 3000);
      await CrowdFund.connect(user2).pledge(1, 3000);

      expect(await CrowdFund.getPledgeAmount(1)).to.be.lessThan(goal);

      await timeTravel(5000);

      const balanceBefore = await USDC.balanceOf(user1.address);
      await CrowdFund.connect(user1).refund(1);
      const balanceAfter = await USDC.balanceOf(user1.address);

      expect(balanceAfter - balanceBefore).to.be.equal(3000);
      await expect(CrowdFund.claim(1)).to.be.revertedWith(
        "Campaign did not succed",
      );
    });

    it("Fund cancel", async () => {
      startTimeStamp = await getTimeStamp();
      await expect(
        CrowdFund.launch(goal, startTimeStamp + 100, startTimeStamp),
      ).to.be.revertedWith("End time is less than Start time");

      await CrowdFund.launch(goal, startTimeStamp + 100, startTimeStamp + 5000);

      await expect(CrowdFund.cancel(2)).to.be.revertedWith(
        "Index out of count",
      );
      await expect(CrowdFund.connect(user1).cancel(1)).to.be.revertedWith(
        "You did not create this Campaign",
      );
      await CrowdFund.cancel(1);
    });
  });
});
