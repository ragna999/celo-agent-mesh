// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AgentMessenger
 * @notice Onchain messaging between AI agents on Celo
 * @dev Agents send requests, responses, signals, and payments via onchain messages
 *      All messages are logged as events for easy indexing
 */
contract AgentMessenger {
    // ─── TYPES ────────────────────────────────────────────────

    enum MessageType {
        Request,    // Agent A asks Agent B for something
        Response,   // Agent B replies to Agent A
        Signal,     // Broadcast signal (e.g. "large transfer detected")
        Payment,    // Payment notification
        System      // System-level message (registry updates, etc)
    }

    struct Message {
        uint256 id;
        address from;
        address to;              // address(0) = broadcast
        MessageType msgType;
        bytes payload;           // ABI-encoded data
        string subject;          // human-readable subject
        uint256 timestamp;
        uint256 replyTo;         // 0 if not a reply
        bool read;
    }

    // ─── STATE ────────────────────────────────────────────────

    uint256 public nextMessageId;

    // messageId => Message
    mapping(uint256 => Message) public messages;

    // address => unread message count
    mapping(address => uint256) public unreadCount;

    // address => sent message IDs
    mapping(address => uint256[]) public sentMessages;

    // address => received message IDs (includes broadcasts)
    mapping(address => uint256[]) public inbox;

    // thread: (from, to) => message IDs
    mapping(bytes32 => uint256[]) public threads;

    // all broadcast message IDs
    uint256[] public broadcasts;

    // registry reference (to verify agent status)
    address public registry;

    // ─── EVENTS ───────────────────────────────────────────────

    event MessageSent(
        uint256 indexed id,
        address indexed from,
        address indexed to,
        MessageType msgType,
        string subject,
        uint256 replyTo
    );

    event MessageRead(uint256 indexed id, address indexed by);

    // ─── CONSTRUCTOR ──────────────────────────────────────────

    constructor(address _registry) {
        registry = _registry;
        nextMessageId = 1;
    }

    // ─── SEND FUNCTIONS ───────────────────────────────────────

    function sendMessage(
        address _to,
        MessageType _msgType,
        bytes calldata _payload,
        string calldata _subject,
        uint256 _replyTo
    ) external returns (uint256) {
        return _sendMessageInternal(_to, _msgType, _payload, _subject, _replyTo);
    }

    function _sendMessageInternal(
        address _to,
        MessageType _msgType,
        bytes memory _payload,
        string memory _subject,
        uint256 _replyTo
    ) internal returns (uint256) {
        uint256 id = nextMessageId++;

        messages[id] = Message({
            id: id,
            from: msg.sender,
            to: _to,
            msgType: _msgType,
            payload: _payload,
            subject: _subject,
            timestamp: block.timestamp,
            replyTo: _replyTo,
            read: false
        });

        sentMessages[msg.sender].push(id);

        if (_to == address(0)) {
            // Broadcast
            broadcasts.push(id);
        } else {
            // Direct message
            inbox[_to].push(id);
            unreadCount[_to]++;

            // Index thread
            bytes32 threadKey = _getThreadKey(msg.sender, _to);
            threads[threadKey].push(id);
        }

        // If reply, also add to original sender's inbox
        if (_replyTo > 0) {
            Message storage original = messages[_replyTo];
            if (original.from != msg.sender && original.from != _to) {
                inbox[original.from].push(id);
                unreadCount[original.from]++;
            }
        }

        emit MessageSent(id, msg.sender, _to, _msgType, _subject, _replyTo);
        return id;
    }

    /**
     * @notice Send a request to another agent
     */
    function sendRequest(
        address _to,
        bytes calldata _payload,
        string calldata _subject
    ) external returns (uint256) {
        return _sendMessageInternal(_to, MessageType.Request, _payload, _subject, 0);
    }

    /**
     * @notice Reply to a message
     */
    function reply(
        uint256 _replyTo,
        bytes calldata _payload,
        string calldata _subject
    ) external returns (uint256) {
        Message storage original = messages[_replyTo];
        require(original.id > 0, "Original message not found");

        // Reply goes to the original sender
        address to = original.from == msg.sender ? original.to : original.from;

        return _sendMessageInternal(to, MessageType.Response, _payload, _subject, _replyTo);
    }

    /**
     * @notice Broadcast a signal to all agents
     */
    function broadcast(
        bytes calldata _payload,
        string calldata _subject
    ) external returns (uint256) {
        return _sendMessageInternal(address(0), MessageType.Signal, _payload, _subject, 0);
    }

    /**
     * @notice Send payment notification
     */
    function sendPaymentNotice(
        address _to,
        uint256 _invoiceId,
        address _token,
        uint256 _amount
    ) external returns (uint256) {
        bytes memory payload = abi.encode(_invoiceId, _token, _amount);
        string memory subject = "Payment notification";
        return _sendMessageInternal(_to, MessageType.Payment, payload, subject, 0);
    }

    // ─── READ FUNCTIONS ───────────────────────────────────────

    function getMessage(uint256 _id) external view returns (Message memory) {
        return messages[_id];
    }

    function getInbox(address _agent) external view returns (uint256[] memory) {
        return inbox[_agent];
    }

    function getUnreadCount(address _agent) external view returns (uint256) {
        return unreadCount[_agent];
    }

    function getThread(address _a, address _b) external view returns (uint256[] memory) {
        return threads[_getThreadKey(_a, _b)];
    }

    function getSentMessages(address _agent) external view returns (uint256[] memory) {
        return sentMessages[_agent];
    }

    function getBroadcasts() external view returns (uint256[] memory) {
        return broadcasts;
    }

    // ─── MARK READ ────────────────────────────────────────────

    function markRead(uint256 _id) external {
        Message storage m = messages[_id];
        require(m.to == msg.sender || m.to == address(0), "Not recipient");
        if (!m.read) {
            m.read = true;
            unreadCount[msg.sender]--;
            emit MessageRead(_id, msg.sender);
        }
    }

    function markAllRead() external {
        uint256[] memory ids = inbox[msg.sender];
        for (uint256 i = 0; i < ids.length; i++) {
            if (!messages[ids[i]].read) {
                messages[ids[i]].read = true;
                emit MessageRead(ids[i], msg.sender);
            }
        }
        unreadCount[msg.sender] = 0;
    }

    // ─── INTERNAL ─────────────────────────────────────────────

    function _getThreadKey(address _a, address _b) internal pure returns (bytes32) {
        if (_a < _b) {
            return keccak256(abi.encodePacked(_a, _b));
        }
        return keccak256(abi.encodePacked(_b, _a));
    }
}
