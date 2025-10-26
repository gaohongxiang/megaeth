# 🛰️ MegaETH Realtime Bot (Pinger)

一个基于 **MegaETH 测试网** 的高频交互机器人，通过自动化智能合约调用来测试网络性能、生成活跃度数据，并提供实时链上监控功能。适用于压力测试、性能评估。

## 🧩 项目结构

```
📦 megaeth
├── contracts/
│ └── Pinger.sol # 智能合约
├── scripts/
│ └── deploy.js # 部署脚本
├── realtime.js # 高频交互机器人
├── hardhat.config.js # Hardhat 配置
├── frontend/ # 前端可视化 (React)
└── .env # 环境变量配置
```

## 💰 获取测试网 ETH

在开始之前，你需要获取测试网 ETH 来支付 gas 费用：

👉 **水龙头地址**: https://testnet.megaeth.com/

将你的钱包地址粘贴到水龙头页面即可获取免费的测试网 ETH。


## ⚙️ 环境配置

### 1️⃣ 安装依赖
```bash
npm install
```

### 2️⃣ 创建 .env
```bash
cp .env.example .env
```
根据文件内提示填入必要变量

### 3️⃣ 编译合约
```bash
npx hardhat compile
```

### 4️⃣ 部署合约
```bash
npx hardhat run scripts/deploy.js --network megaeth
```
部署成功后会打印：✅ PingerV2 deployed to: 0xABCDEF... 将合约地址复制到.env文件

## 🧠 合约功能说明

| 函数 | 说明 |
|------|------|
| `poke()` | 记录一次调用并统计 gas 消耗 |
| `getStats(address)` | 查询某地址的调用次数与 gas 总量 |
| `getAllUsers()` | 返回所有交互过的用户 |
| `getTopUsers(n)` | 返回前 N 名最活跃用户 |

## 🚀 启动机器人

```bash
node realtime.js
```

该脚本将：

每隔 0.8~1s 调用一次 poke()

使用 WebSocket 订阅 miniBlocks 和 logs

打印实时交易信息与延迟

模拟高频交互（用于 KPI 活跃度）