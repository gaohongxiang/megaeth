// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title PingerV3 - Advanced Market Making Contract for MegaETH
/// @notice Simulates order book operations with price discovery and liquidity management
contract Pinger {
    // Events
    event Ping(address indexed caller, uint256 indexed time, uint256 nonce, uint256 gasUsed);
    event OrderPlaced(address indexed trader, uint256 indexed orderId, uint256 price, uint256 amount, bool isBuy);
    event OrderCancelled(address indexed trader, uint256 indexed orderId);
    event OrderExecuted(address indexed trader, uint256 indexed orderId, uint256 executionPrice);
    event PriceUpdated(uint256 oldPrice, uint256 newPrice);

    // Structs
    struct Stats {
        uint256 callCount;
        uint256 totalGas;
        uint256 ordersPlaced;
        uint256 ordersCancelled;
    }

    struct Order {
        address trader;
        uint256 price;
        uint256 amount;
        bool isBuy;
        bool isActive;
        uint256 timestamp;
    }

    // State variables
    mapping(address => Stats) public userStats;
    mapping(uint256 => Order) public orders;
    address[] public allUsers;
    
    uint256 public totalPings;
    uint256 public totalGasUsed;
    uint256 public currentPrice = 1000; // Base price in wei
    uint256 public nextOrderId = 1;
    uint256 public totalVolume;
    uint256 public lastPriceUpdate;

    // Market making parameters
    uint256 public constant PRICE_IMPACT = 1; // Price moves by 1 wei per trade
    uint256 public constant MAX_PRICE_CHANGE = 50; // Max 5% price change per update

    /// @notice Basic poke function for backward compatibility
    function poke() external {
        uint256 gasStart = gasleft();
        totalPings++;

        Stats storage s = userStats[msg.sender];
        if (s.callCount == 0) {
            allUsers.push(msg.sender);
        }
        s.callCount++;
        s.totalGas += (gasStart - gasleft());
        totalGasUsed += (gasStart - gasleft());

        emit Ping(msg.sender, block.timestamp, totalPings, s.totalGas);
    }

    /// @notice Enhanced poke with market data
    function pokeWithData(uint256 price, uint256 amount) external {
        uint256 gasStart = gasleft();
        totalPings++;
        
        // Update price based on market activity
        _updatePrice(price, amount);
        
        Stats storage s = userStats[msg.sender];
        if (s.callCount == 0) {
            allUsers.push(msg.sender);
        }
        s.callCount++;
        s.totalGas += (gasStart - gasleft());
        totalGasUsed += (gasStart - gasleft());
        totalVolume += amount;

        emit Ping(msg.sender, block.timestamp, totalPings, s.totalGas);
    }

    /// @notice Place a simulated order
    function placeOrder(uint256 price, uint256 amount, bool isBuy) external returns (uint256 orderId) {
        require(price > 0 && amount > 0, "Invalid price or amount");
        
        orderId = nextOrderId++;
        orders[orderId] = Order({
            trader: msg.sender,
            price: price,
            amount: amount,
            isBuy: isBuy,
            isActive: true,
            timestamp: block.timestamp
        });

        Stats storage s = userStats[msg.sender];
        if (s.callCount == 0) {
            allUsers.push(msg.sender);
        }
        s.ordersPlaced++;
        
        emit OrderPlaced(msg.sender, orderId, price, amount, isBuy);
        
        // Simulate immediate execution for market orders
        if (_shouldExecuteImmediately(price, isBuy)) {
            _executeOrder(orderId);
        }
    }

    /// @notice Cancel an order
    function cancelOrder(uint256 orderId) external {
        Order storage order = orders[orderId];
        require(order.trader == msg.sender, "Not your order");
        require(order.isActive, "Order not active");
        
        order.isActive = false;
        userStats[msg.sender].ordersCancelled++;
        
        emit OrderCancelled(msg.sender, orderId);
    }

    /// @notice Batch operations for high-frequency trading
    function batchPoke(uint256[] calldata amounts) external {
        require(amounts.length <= 10, "Too many operations");
        
        for (uint256 i = 0; i < amounts.length; i++) {
            // Call internal poke logic for each amount
            uint256 gasStart = gasleft();
            totalPings++;
            
            Stats storage s = userStats[msg.sender];
            if (s.callCount == 0) {
                allUsers.push(msg.sender);
            }
            s.callCount++;
            s.totalGas += (gasStart - gasleft());
            totalGasUsed += (gasStart - gasleft());
            totalVolume += amounts[i];
            
            // Update price slightly for each operation
            _updatePrice(currentPrice + i, amounts[i]);
            
            emit Ping(msg.sender, block.timestamp, totalPings, s.totalGas);
        }
    }

    /// @notice Get current market state
    function getMarketState() external view returns (
        uint256 price,
        uint256 volume,
        uint256 totalOrders,
        uint256 lastUpdate
    ) {
        return (currentPrice, totalVolume, nextOrderId - 1, lastPriceUpdate);
    }

    /// @notice Get order details
    function getOrder(uint256 orderId) external view returns (Order memory) {
        return orders[orderId];
    }

    /// @notice Get enhanced user stats
    function getEnhancedStats(address user) external view returns (
        uint256 calls,
        uint256 gasUsed,
        uint256 ordersPlaced,
        uint256 ordersCancelled
    ) {
        Stats memory s = userStats[user];
        return (s.callCount, s.totalGas, s.ordersPlaced, s.ordersCancelled);
    }

    // Legacy functions for backward compatibility
    function getStats(address user) external view returns (uint256 calls, uint256 gasUsed) {
        Stats memory s = userStats[user];
        return (s.callCount, s.totalGas);
    }

    function getAllUsers() external view returns (address[] memory) {
        return allUsers;
    }

    function getTopUsers(uint256 n) external view returns (address[] memory topUsers) {
        require(n > 0, "N must be > 0");
        uint256 len = allUsers.length;
        if (n > len) n = len;

        address[] memory sorted = allUsers;
        for (uint256 i = 0; i < len; i++) {
            for (uint256 j = i + 1; j < len; j++) {
                if (userStats[sorted[j]].callCount > userStats[sorted[i]].callCount) {
                    address tmp = sorted[i];
                    sorted[i] = sorted[j];
                    sorted[j] = tmp;
                }
            }
        }

        topUsers = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            topUsers[i] = sorted[i];
        }
    }

    // Internal functions
    function _updatePrice(uint256 inputPrice, uint256 amount) internal {
        uint256 oldPrice = currentPrice;
        
        // Simple price discovery: move towards input price with volume weighting
        if (inputPrice > currentPrice) {
            uint256 increase = (inputPrice - currentPrice) * amount / 1000;
            if (increase > MAX_PRICE_CHANGE) increase = MAX_PRICE_CHANGE;
            currentPrice += increase;
        } else if (inputPrice < currentPrice) {
            uint256 decrease = (currentPrice - inputPrice) * amount / 1000;
            if (decrease > MAX_PRICE_CHANGE) decrease = MAX_PRICE_CHANGE;
            if (decrease < currentPrice) currentPrice -= decrease;
        }
        
        lastPriceUpdate = block.timestamp;
        
        if (oldPrice != currentPrice) {
            emit PriceUpdated(oldPrice, currentPrice);
        }
    }

    function _shouldExecuteImmediately(uint256 price, bool isBuy) internal view returns (bool) {
        // Execute if price crosses current market price
        if (isBuy && price >= currentPrice) return true;
        if (!isBuy && price <= currentPrice) return true;
        return false;
    }

    function _executeOrder(uint256 orderId) internal {
        Order storage order = orders[orderId];
        require(order.isActive, "Order not active");
        
        order.isActive = false;
        
        // Update price based on execution
        if (order.isBuy) {
            currentPrice += PRICE_IMPACT;
        } else {
            if (currentPrice > PRICE_IMPACT) currentPrice -= PRICE_IMPACT;
        }
        
        emit OrderExecuted(order.trader, orderId, currentPrice);
    }
}
