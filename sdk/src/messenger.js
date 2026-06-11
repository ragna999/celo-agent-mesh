import { Contract } from 'ethers';
import { MessageType as MT } from './constants.js';

/**
 * AgentMessenger — onchain messaging between agents
 */
export class AgentMessenger {
  constructor(provider, address) {
    this.contract = new Contract(address, MESSENGER_ABI, provider);
  }

  // ─── WRITE ────────────────────────────────────────────────

  /**
   * Send a message to another agent
   * @param {Signer} signer
   * @param {string} to - recipient address (address(0) for broadcast)
   * @param {number} msgType - MessageType enum (0-4)
   * @param {bytes} payload - ABI-encoded data
   * @param {string} subject - human-readable subject
   * @param {number} replyTo - message ID to reply to (0 if not a reply)
   * @returns {{ tx, messageId }}
   */
  async sendMessage(signer, to, msgType, payload, subject, replyTo = 0) {
    const contract = this.contract.connect(signer);
    const tx = await contract.sendMessage(to, msgType, payload, subject, replyTo);
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => {
      try { return contract.interface.parseLog(log)?.name === 'MessageSent'; }
      catch { return false; }
    });
    const parsed = event ? contract.interface.parseLog(event) : null;
    return { tx: receipt, messageId: parsed?.args?.id ?? null };
  }

  /**
   * Send a request to another agent
   */
  async sendRequest(signer, to, payload, subject) {
    const contract = this.contract.connect(signer);
    const tx = await contract.sendRequest(to, payload, subject);
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => {
      try { return contract.interface.parseLog(log)?.name === 'MessageSent'; }
      catch { return false; }
    });
    const parsed = event ? contract.interface.parseLog(event) : null;
    return { tx: receipt, messageId: parsed?.args?.id ?? null };
  }

  /**
   * Reply to a message
   */
  async reply(signer, replyToId, payload, subject) {
    const contract = this.contract.connect(signer);
    const tx = await contract.reply(replyToId, payload, subject);
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => {
      try { return contract.interface.parseLog(log)?.name === 'MessageSent'; }
      catch { return false; }
    });
    const parsed = event ? contract.interface.parseLog(event) : null;
    return { tx: receipt, messageId: parsed?.args?.id ?? null };
  }

  /**
   * Broadcast a signal to all agents
   */
  async broadcast(signer, payload, subject) {
    const contract = this.contract.connect(signer);
    const tx = await contract.broadcast(payload, subject);
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => {
      try { return contract.interface.parseLog(log)?.name === 'MessageSent'; }
      catch { return false; }
    });
    const parsed = event ? contract.interface.parseLog(event) : null;
    return { tx: receipt, messageId: parsed?.args?.id ?? null };
  }

  /**
   * Send payment notification
   */
  async sendPaymentNotice(signer, to, invoiceId, token, amount) {
    const contract = this.contract.connect(signer);
    const tx = await contract.sendPaymentNotice(to, invoiceId, token, amount);
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => {
      try { return contract.interface.parseLog(log)?.name === 'MessageSent'; }
      catch { return false; }
    });
    const parsed = event ? contract.interface.parseLog(event) : null;
    return { tx: receipt, messageId: parsed?.args?.id ?? null };
  }

  /**
   * Mark a message as read
   */
  async markRead(signer, messageId) {
    const contract = this.contract.connect(signer);
    const tx = await contract.markRead(messageId);
    return tx.wait();
  }

  /**
   * Mark all inbox messages as read
   */
  async markAllRead(signer) {
    const contract = this.contract.connect(signer);
    const tx = await contract.markAllRead();
    return tx.wait();
  }

  // ─── READ ─────────────────────────────────────────────────

  /**
   * Get a message by ID
   */
  async getMessage(messageId) {
    const r = await this.contract.getMessage(messageId);
    return {
      id: r.id ?? r[0],
      from: r.from ?? r[1],
      to: r.to ?? r[2],
      msgType: Number(r.msgType ?? r[3]),
      payload: r.payload ?? r[4],
      subject: r.subject ?? r[5],
      timestamp: r.timestamp ?? r[6],
      replyTo: r.replyTo ?? r[7],
      read: r.read ?? r[8],
    };
  }

  /**
   * Get inbox message IDs for an agent
   */
  async getInbox(address) {
    const ids = await this.contract.getInbox(address);
    return ids.map(Number);
  }

  /**
   * Get unread message count
   */
  async getUnreadCount(address) {
    const r = await this.contract.getUnreadCount(address);
    return Number(r);
  }

  /**
   * Get thread between two agents
   */
  async getThread(addressA, addressB) {
    const ids = await this.contract.getThread(addressA, addressB);
    return ids.map(Number);
  }

  /**
   * Get sent message IDs
   */
  async getSentMessages(address) {
    const ids = await this.contract.getSentMessages(address);
    return ids.map(Number);
  }

  /**
   * Get all broadcast message IDs
   */
  async getBroadcasts() {
    const ids = await this.contract.getBroadcasts();
    return ids.map(Number);
  }
}

let MESSENGER_ABI = null;

export function setMessengerAbi(abi) {
  MESSENGER_ABI = abi;
}
