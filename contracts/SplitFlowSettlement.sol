// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract SplitFlowSettlement {
    IERC20 public immutable usdc;

    event SettlementPaid(
        bytes32 indexed groupId,
        address indexed payer,
        address indexed recipient,
        uint256 amount
    );

    constructor(address usdcAddress) {
        require(usdcAddress != address(0), "invalid USDC");
        usdc = IERC20(usdcAddress);
    }

    function settle(
        bytes32 groupId,
        address recipient,
        uint256 amount
    ) external {
        require(recipient != address(0), "invalid recipient");
        require(amount > 0, "invalid amount");
        require(usdc.transferFrom(msg.sender, recipient, amount), "transfer failed");
        emit SettlementPaid(groupId, msg.sender, recipient, amount);
    }

    function settleBatch(
        bytes32 groupId,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external {
        require(recipients.length == amounts.length, "length mismatch");

        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "invalid recipient");
            require(amounts[i] > 0, "invalid amount");
            require(
                usdc.transferFrom(msg.sender, recipients[i], amounts[i]),
                "transfer failed"
            );
            emit SettlementPaid(groupId, msg.sender, recipients[i], amounts[i]);
        }
    }
}
