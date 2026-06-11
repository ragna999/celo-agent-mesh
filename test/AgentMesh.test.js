const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AgentMesh", function () {
  let registry, payments, messenger;
  let owner, agent1, agent2, feeRecipient;

  // Celo cUSD address (for testing we'll use a mock)
  const CUSD = "0x765DE816845861e75A25fCA122bb6898B8B1282a";

  beforeEach(async function () {
    [owner, agent1, agent2, feeRecipient] = await ethers.getSigners();

    // Deploy Registry
    const Registry = await ethers.getContractFactory("AgentRegistry");
    registry = await Registry.deploy();
    await registry.waitForDeployment();

    // Deploy Payments
    const Payments = await ethers.getContractFactory("AgentPayments");
    payments = await Payments.deploy(feeRecipient.address, await registry.getAddress());
    await payments.waitForDeployment();

    // Deploy Messenger
    const Messenger = await ethers.getContractFactory("AgentMessenger");
    messenger = await Messenger.deploy(await registry.getAddress());
    await messenger.waitForDeployment();
  });

  describe("AgentRegistry", function () {
    it("should register an agent", async function () {
      await registry.connect(agent1).register(
        "PriceBot",
        ["price-feed", "swap"],
        "https://pricebot.celo.mesh",
        ethers.parseEther("0.001"),
        '{"version":"1.0"}'
      );

      const agent = await registry.getAgent(agent1.address);
      expect(agent.name).to.equal("PriceBot");
      expect(agent.active).to.be.true;
      expect(agent.capabilities).to.deep.equal(["price-feed", "swap"]);
    });

    it("should search agents by capability", async function () {
      await registry.connect(agent1).register(
        "PriceBot",
        ["price-feed"],
        "https://pricebot.celo.mesh",
        ethers.parseEther("0.001"),
        ""
      );

      await registry.connect(agent2).register(
        "SwapBot",
        ["swap", "price-feed"],
        "https://swapbot.celo.mesh",
        ethers.parseEther("0.005"),
        ""
      );

      const priceAgents = await registry.search("price-feed");
      expect(priceAgents.length).to.equal(2);

      const swapAgents = await registry.search("swap");
      expect(swapAgents.length).to.equal(1);
      expect(swapAgents[0]).to.equal(agent2.address);
    });

    it("should update agent", async function () {
      await registry.connect(agent1).register(
        "PriceBot",
        ["price-feed"],
        "https://old.endpoint",
        ethers.parseEther("0.001"),
        ""
      );

      await registry.connect(agent1).update(
        ["price-feed", "yield"],
        "https://new.endpoint",
        ethers.parseEther("0.002"),
        true,
        '{"version":"2.0"}'
      );

      const agent = await registry.getAgent(agent1.address);
      expect(agent.endpoint).to.equal("https://new.endpoint");
      expect(agent.capabilities).to.deep.equal(["price-feed", "yield"]);
    });

    it("should deactivate agent", async function () {
      await registry.connect(agent1).register(
        "PriceBot", ["price-feed"], "https://x", ethers.parseEther("0.001"), ""
      );

      await registry.connect(agent1).deactivate();
      const agent = await registry.getAgent(agent1.address);
      expect(agent.active).to.be.false;
    });

    it("should check isAgent", async function () {
      expect(await registry.isAgent(agent1.address)).to.be.false;

      await registry.connect(agent1).register(
        "PriceBot", ["price-feed"], "https://x", ethers.parseEther("0.001"), ""
      );

      expect(await registry.isAgent(agent1.address)).to.be.true;
    });
  });

  describe("AgentPayments", function () {
    it("should create invoice", async function () {
      await payments.connect(agent1).createInvoice(
        agent2.address,
        CUSD,
        ethers.parseEther("1"),
        "Price data for cUSD/USDT"
      );

      const invoice = await payments.getInvoice(1);
      expect(invoice.from).to.equal(agent1.address);
      expect(invoice.to).to.equal(agent2.address);
      expect(invoice.amount).to.equal(ethers.parseEther("1"));
      expect(invoice.status).to.equal(0); // Created
    });

    it("should get sent and received invoices", async function () {
      await payments.connect(agent1).createInvoice(
        agent2.address, CUSD, ethers.parseEther("1"), "test"
      );

      const sent = await payments.getSentInvoices(agent1.address);
      const received = await payments.getReceivedInvoices(agent2.address);

      expect(sent.length).to.equal(1);
      expect(received.length).to.equal(1);
      expect(sent[0]).to.equal(1);
    });

    it("should refund invoice", async function () {
      await payments.connect(agent1).createInvoice(
        agent2.address, CUSD, ethers.parseEther("1"), "test"
      );

      await payments.connect(agent1).refundInvoice(1);
      const invoice = await payments.getInvoice(1);
      expect(invoice.status).to.equal(3); // Refunded
    });
  });

  describe("AgentMessenger", function () {
    it("should send direct message", async function () {
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(
        ["string"],
        ["What is cUSD price?"]
      );

      await messenger.connect(agent1).sendMessage(
        agent2.address,
        0, // Request
        payload,
        "Price Query",
        0
      );

      const msg = await messenger.getMessage(1);
      expect(msg.from).to.equal(agent1.address);
      expect(msg.to).to.equal(agent2.address);
      expect(msg.subject).to.equal("Price Query");

      const unread = await messenger.getUnreadCount(agent2.address);
      expect(unread).to.equal(1);
    });

    it("should send broadcast", async function () {
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256"],
        [1000000]
      );

      await messenger.connect(agent1).broadcast(payload, "Large transfer detected");

      const broadcasts = await messenger.getBroadcasts();
      expect(broadcasts.length).to.equal(1);
    });

    it("should reply to message", async function () {
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(
        ["string"],
        ["What is cUSD price?"]
      );

      await messenger.connect(agent1).sendMessage(
        agent2.address, 0, payload, "Price Query", 0
      );

      const replyPayload = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256"],
        [1002000]
      );

      await messenger.connect(agent2).reply(1, replyPayload, "Re: Price Query");

      const reply = await messenger.getMessage(2);
      expect(reply.from).to.equal(agent2.address);
      expect(reply.to).to.equal(agent1.address);
      expect(reply.replyTo).to.equal(1);
    });

    it("should mark messages as read", async function () {
      const payload = "0x";
      await messenger.connect(agent1).sendMessage(
        agent2.address, 0, payload, "test", 0
      );

      expect(await messenger.getUnreadCount(agent2.address)).to.equal(1);

      await messenger.connect(agent2).markRead(1);

      expect(await messenger.getUnreadCount(agent2.address)).to.equal(0);
    });

    it("should track thread between agents", async function () {
      const payload = "0x";

      await messenger.connect(agent1).sendMessage(
        agent2.address, 0, payload, "msg1", 0
      );
      await messenger.connect(agent2).sendMessage(
        agent1.address, 1, payload, "msg2", 0
      );

      const thread = await messenger.getThread(agent1.address, agent2.address);
      expect(thread.length).to.equal(2);
    });
  });
});
