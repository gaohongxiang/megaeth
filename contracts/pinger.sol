// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Pinger - Enhanced contract for MegaETH realtime bot testing
/// @notice Tracks calls, gas usage, and top contributors
contract Pinger {
    event Ping(address indexed caller, uint256 indexed time, uint256 nonce, uint256 gasUsed);

    struct Stats {
        uint256 callCount;
        uint256 totalGas;
    }

    mapping(address => Stats) public userStats;
    address[] public allUsers;

    uint256 public totalPings;
    uint256 public totalGasUsed;

    /// @notice call this to emit an event and record gas usage
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

    function getStats(address user) external view returns (uint256 calls, uint256 gasUsed) {
        Stats memory s = userStats[user];
        return (s.callCount, s.totalGas);
    }

    function getAllUsers() external view returns (address[] memory) {
        return allUsers;
    }

    /// @notice Returns top N most active callers
    function getTopUsers(uint256 n) external view returns (address[] memory topUsers) {
        require(n > 0, "N must be > 0");
        uint256 len = allUsers.length;
        if (n > len) n = len;

        address[] memory sorted = allUsers;
        // 简单冒泡排序（测试用）
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
}
