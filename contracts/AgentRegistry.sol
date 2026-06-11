// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AgentRegistry
 * @notice Onchain registry for AI agents on Celo
 * @dev Agents register their capabilities, fees, and endpoints
 *      Other agents can discover them by capability
 */
contract AgentRegistry {
    // ─── TYPES ────────────────────────────────────────────────

    struct Agent {
        string name;
        string[] capabilities;
        string endpoint;           // HTTP/MCP endpoint for offchain comms
        uint256 feePerRequest;     // in wei (cUSD smallest unit)
        address owner;
        uint256 registeredAt;
        uint256 totalRequests;     // how many times this agent was called
        bool active;
        string metadata;           // JSON string for extra info
    }

    // ─── STATE ────────────────────────────────────────────────

    // agent address => Agent struct
    mapping(address => Agent) public agents;

    // capability string => list of agent addresses
    mapping(string => address[]) public capabilityIndex;

    // all registered agent addresses
    address[] public allAgents;

    // owner can pause
    address public owner;
    bool public paused;

    // ─── EVENTS ───────────────────────────────────────────────

    event AgentRegistered(
        address indexed agent,
        string name,
        string[] capabilities,
        uint256 feePerRequest
    );

    event AgentUpdated(
        address indexed agent,
        string[] capabilities,
        uint256 feePerRequest,
        bool active
    );

    event AgentDeactivated(address indexed agent);
    event RequestRecorded(address indexed agent);

    // Address allowed to call recordRequest (set to payments contract)
    address public paymentsContract;

    // ─── MODIFIERS ────────────────────────────────────────────

    modifier whenNotPaused() {
        require(!paused, "Registry is paused");
        _;
    }

    modifier onlyPaymentsContract() {
        require(msg.sender == paymentsContract, "Only payments contract");
        _;
    }

    // ─── CONSTRUCTOR ──────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    // ─── CORE FUNCTIONS ───────────────────────────────────────

    /**
     * @notice Register an agent onchain
     * @param _name Human-readable name
     * @param _capabilities Array of capability strings (e.g. ["price-feed", "swap"])
     * @param _endpoint Offchain endpoint URL
     * @param _feePerRequest Fee in wei per request
     * @param _metadata JSON string with extra info
     */
    function register(
        string calldata _name,
        string[] calldata _capabilities,
        string calldata _endpoint,
        uint256 _feePerRequest,
        string calldata _metadata
    ) external whenNotPaused {
        require(_capabilities.length > 0, "Must have at least 1 capability");
        require(bytes(_name).length > 0, "Name cannot be empty");

        // Check if this is a new agent BEFORE modifying state
        bool isNew = agents[msg.sender].registeredAt == 0;
        
        // Preserve totalRequests on re-registration
        uint256 existingRequests = agents[msg.sender].totalRequests;

        // If re-registering, clean up old capability index
        if (!isNew) {
            _removeFromCapabilities(msg.sender);
        }

        agents[msg.sender] = Agent({
            name: _name,
            capabilities: _capabilities,
            endpoint: _endpoint,
            feePerRequest: _feePerRequest,
            owner: msg.sender,
            registeredAt: block.timestamp,
            totalRequests: existingRequests,  // Preserve request count
            active: true,
            metadata: _metadata
        });

        // Index by capability (with duplicate check)
        for (uint256 i = 0; i < _capabilities.length; i++) {
            // Check for duplicates before adding
            bool alreadyIndexed = false;
            address[] storage index = capabilityIndex[_capabilities[i]];
            for (uint256 j = 0; j < index.length; j++) {
                if (index[j] == msg.sender) {
                    alreadyIndexed = true;
                    break;
                }
            }
            if (!alreadyIndexed) {
                capabilityIndex[_capabilities[i]].push(msg.sender);
            }
        }

        // Add to allAgents if new
        if (isNew) {
            allAgents.push(msg.sender);
        }

        emit AgentRegistered(msg.sender, _name, _capabilities, _feePerRequest);
    }

    /**
     * @notice Update agent details
     */
    function update(
        string[] calldata _capabilities,
        string calldata _endpoint,
        uint256 _feePerRequest,
        bool _active,
        string calldata _metadata
    ) external {
        require(agents[msg.sender].registeredAt > 0, "Not registered");

        // Clean up old index
        _removeFromCapabilities(msg.sender);

        agents[msg.sender].capabilities = _capabilities;
        agents[msg.sender].endpoint = _endpoint;
        agents[msg.sender].feePerRequest = _feePerRequest;
        agents[msg.sender].active = _active;
        agents[msg.sender].metadata = _metadata;

        // Re-index (with duplicate check)
        for (uint256 i = 0; i < _capabilities.length; i++) {
            bool alreadyIndexed = false;
            address[] storage index = capabilityIndex[_capabilities[i]];
            for (uint256 j = 0; j < index.length; j++) {
                if (index[j] == msg.sender) {
                    alreadyIndexed = true;
                    break;
                }
            }
            if (!alreadyIndexed) {
                capabilityIndex[_capabilities[i]].push(msg.sender);
            }
        }

        emit AgentUpdated(msg.sender, _capabilities, _feePerRequest, _active);
    }

    /**
     * @notice Deactivate an agent
     */
    function deactivate() external {
        require(agents[msg.sender].registeredAt > 0, "Not registered");
        agents[msg.sender].active = false;
        emit AgentDeactivated(msg.sender);
    }

    // ─── READ FUNCTIONS ───────────────────────────────────────

    /**
     * @notice Find all active agents with a specific capability
     * @param _capability The capability to search for
     * @return addresses Array of agent addresses
     */
    function search(string calldata _capability) external view returns (address[] memory) {
        address[] memory all = capabilityIndex[_capability];
        
        // Count active agents
        uint256 count = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (agents[all[i]].active) count++;
        }

        // Build result array
        address[] memory result = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (agents[all[i]].active) {
                result[idx++] = all[i];
            }
        }

        return result;
    }

    /**
     * @notice Get agent details
     */
    function getAgent(address _addr) external view returns (
        string memory name,
        string[] memory capabilities,
        string memory endpoint,
        uint256 feePerRequest,
        uint256 totalRequests,
        bool active,
        string memory metadata
    ) {
        Agent storage a = agents[_addr];
        require(a.registeredAt > 0, "Agent not found");
        return (
            a.name,
            a.capabilities,
            a.endpoint,
            a.feePerRequest,
            a.totalRequests,
            a.active,
            a.metadata
        );
    }

    /**
     * @notice Get total number of registered agents
     */
    function totalAgents() external view returns (uint256) {
        return allAgents.length;
    }

    /**
     * @notice Get all registered agent addresses
     */
    function getAllAgents() external view returns (address[] memory) {
        return allAgents;
    }

    /**
     * @notice Check if an address is a registered agent
     */
    function isAgent(address _addr) external view returns (bool) {
        return agents[_addr].registeredAt > 0 && agents[_addr].active;
    }

    /**
     * @notice Increment request counter (called by PaymentRouter after payment)
     */
    function recordRequest(address _agent) external onlyPaymentsContract {
        agents[_agent].totalRequests++;
        emit RequestRecorded(_agent);
    }

    // ─── INTERNAL ─────────────────────────────────────────────

    function _removeFromCapabilities(address _agent) internal {
        string[] storage caps = agents[_agent].capabilities;
        for (uint256 i = 0; i < caps.length; i++) {
            address[] storage index = capabilityIndex[caps[i]];
            for (uint256 j = 0; j < index.length; j++) {
                if (index[j] == _agent) {
                    index[j] = index[index.length - 1];
                    index.pop();
                    break;
                }
            }
        }
    }

    // ─── ADMIN ────────────────────────────────────────────────

    function pause() external {
        require(msg.sender == owner, "Only owner");
        paused = true;
    }

    function unpause() external {
        require(msg.sender == owner, "Only owner");
        paused = false;
    }

    function setPaymentsContract(address _paymentsContract) external {
        require(msg.sender == owner, "Only owner");
        require(_paymentsContract != address(0), "Invalid address");
        paymentsContract = _paymentsContract;
    }

    function transferOwnership(address _newOwner) external {
        require(msg.sender == owner, "Only owner");
        require(_newOwner != address(0), "Invalid new owner");
        owner = _newOwner;
    }
}
