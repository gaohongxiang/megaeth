# 🤖 MegaETH Advanced Market Making Bot

一个基于 **MegaETH 测试网** 的高级做市机器人，通过 **Realtime API** 实现毫秒级交易执行。支持多钱包并行和SOCKS5代理，模拟真实分布式做市商环境。

## ⭐ 核心特性

- 🚀 **Realtime API集成** - 使用`realtime_sendRawTransaction`实现毫秒级交易确认
- 👥 **多钱包并行** - 支持无限钱包同时运行，模拟分布式做市环境
- 🌐 **SOCKS5代理支持** - 每个钱包独立配置带认证的SOCKS5代理
- 📊 **智能做市策略** - 多种操作类型：下单、撤单、修改订单、批量交易
- ⚡ **高频交易** - 420ms间隔，模拟真实做市商节奏
- 🎯 **动态Gas策略** - 紧急/正常/慢速三档Gas费优化
- 📈 **实时统计** - 成功率、延迟、操作分布等关键指标监控

## 🎯 做市策略详解

### 操作类型分布
- **🔴 撤单操作** (35%) - 模拟订单撤销，使用不同价格层级(1-10 wei)
- **🔵 合约调用** (50%) - 调用Pinger合约的`poke()`函数
- **🟢 下单操作** (15%) - 模拟新订单提交
- **🔄 修改订单** (20%) - 先撤单再下单的组合操作
- **📦 批量交易** (15%) - 并行发送3笔交易，测试网络并发处理能力

### 👥 多钱包架构
- **无限钱包支持** - 通过 `WALLET{N}_PRIVATE_KEY` 配置任意数量钱包
- **独立代理配置** - 每个钱包可配置独立的SOCKS5代理
- **并行执行** - 所有钱包同时运行，互不干扰
- **分组统计** - 每个钱包独立的成功率和操作统计
- **错误隔离** - 单个钱包错误不影响其他钱包运行

### 🌐 SOCKS5代理支持
- **带认证代理** - 支持用户名密码认证
- **格式**: `socks5://用户名:密码@代理服务器:端口`
- **直连模式** - 代理为空时自动使用直连
- **独立配置** - 每个钱包使用不同的代理IP

## 获取测试现网 ETH

👉 **水龙头地址**: https://testnet.megaeth.com/
👉 **浏览器**: https://www.megaexplorer.xyz/

## ⚙️ 环境配置

### 1️⃣ 安装依赖
```bash
npm install
```

### 2️⃣ 创建 .env
```bash
cp .env.example .env
```
根据文件内提示填入必要变量，支持多钱包多代理

### 3️⃣ 编译合约
```bash
npx hardhat compile
```

### 4️⃣ 部署合约
```bash
npx hardhat run scripts/deploy.js --network megaeth
```

## 🚀 启动做市机器人

```bash
node realtime.js
```

### 运行效果示例

**多钱包并行模式：**
```
🤖 Advanced Market Making Bot Started
👥 Wallets: 3
🌐 Proxies: 2
📊 Strategy: Cancel=35% Call=50% Batch=15%
🌐 创建SOCKS5代理: socks5://***@proxy1.example.com:1080
💼 W1: 0x70997964...a3e423 🔗 direct
💼 W2: 0x3C44CdDd...07C9D 🌐 proxy1.example.com:1080
💼 W3: 0x90F79bf6...92266 🌐 proxy2.example.com:1080

[MM W0] 🔵 poke OID=0 price=1000
[MM W1] 🔴 cancel OID=10000 price=1000 value=1wei
[MM W2] 📦 BATCH START OID=20000-20002
[MM W0] ✅ poke OID=0 hash=0x84a76cbf... latency=586ms
[MM W1] ✅ cancel OID=10000 hash=0x3f7d8f1c... latency=301ms
[MM W2] ✅ batch[0] OID=20000 hash=0x4c5c8e78...
```

## 🧠 智能合约功能

| 函数 | 说明 | 做市机器人用途 |
|------|------|----------------|
| `poke()` | 记录调用并统计gas消耗 | 50%概率调用，模拟合约交互 |
| `getStats(address)` | 查询地址的调用统计 | 监控机器人活跃度 |
| `getAllUsers()` | 返回所有交互用户 | 分析网络参与者 |
| `getTopUsers(n)` | 返回前N名活跃用户 | 排行榜功能 |

## 📈 性能指标

| 指标 | 数值 | 说明 |
|------|------|------|
| 交易频率 | ~420ms | 每次操作间隔 |
| 平均延迟 | 300-600ms | Realtime API响应时间 |
| 成功率 | >99% | 交易执行成功率 |
| 价格范围 | 990-1010wei | 动态价格发现区间 |
| 并发能力 | 3笔/批次 | 批量交易测试 |
| Gas效率 | 22k-200k | 根据操作类型优化 |

## 🎯 使用场景

- **压力测试** - 多钱包并发测试网络承载能力
- **做市模拟** - 模拟真实分布式做市商环境
- **IP分散** - 通过不同代理分散请求来源
- **风险分散** - 多钱包分散资金和操作风险

## 🏆 MegaETH权重等级

根据MegaETH参与行动手册，本项目达到：

| 权重等级 | 行为类型 | 本项目实现 |
|----------|----------|------------|
| ⭐⭐⭐⭐ (最高) | 部署/运行真实协议或Bot | ✅ 高级做市机器人 |
| ⭐⭐⭐ | 使用Realtime API进行流式交互 | ✅ realtime_sendRawTransaction |
| ⭐⭐ | 高频/稳定交互 + Gas消耗 | ✅ 420ms间隔 + 智能Gas策略 |