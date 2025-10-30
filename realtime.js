import 'dotenv/config'
import { WebSocket } from 'ws'
import { ethers } from 'ethers'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { deCryptText } from './crypt/crypt.js'

const { HTTP_URL, WS_URL, CHAIN_ID, CONTRACT_ADDRESS } = process.env

// 做市节奏参数（可调）
const TICK_MS = 420      // 更高频
const CANCEL_RATIO = 0.35 // 撤单概率（模拟撤单/改单）
const CALL_RATIO = 0.5    // 合约调用比例（有合约时）

// 高级做市策略参数
const BATCH_RATIO = 0.15  // 批量操作概率
const MODIFY_RATIO = 0.2  // 修改订单概率（撤单+下单）
const SPREAD_LEVELS = [1n, 2n, 5n, 10n] // 不同价格层级（wei）
const GAS_STRATEGY = {
    urgent: { multiplier: 1.5, ratio: 0.1 },   // 10%紧急交易
    normal: { multiplier: 1.0, ratio: 0.7 },   // 70%正常交易  
    slow: { multiplier: 0.8, ratio: 0.2 }      // 20%慢速交易
}

// 差异化策略配置 - 扩展到8种策略
const STRATEGIES = {
    // 基础三种策略
    aggressive: { cancel: 0.50, call: 0.30, batch: 0.20, modify: 0.25 },
    balanced: { cancel: 0.35, call: 0.50, batch: 0.15, modify: 0.20 },
    conservative: { cancel: 0.20, call: 0.60, batch: 0.10, modify: 0.15 },

    // 扩展策略
    scalper: { cancel: 0.70, call: 0.10, batch: 0.05, modify: 0.40 },      // 超短线：高撤单高修改
    arbitrage: { cancel: 0.30, call: 0.40, batch: 0.25, modify: 0.10 },    // 套利：高批量低修改
    momentum: { cancel: 0.25, call: 0.45, batch: 0.30, modify: 0.15 },     // 趋势：高批量中等调用
    contrarian: { cancel: 0.40, call: 0.35, batch: 0.10, modify: 0.30 },   // 逆向：高撤单高修改
    passive: { cancel: 0.15, call: 0.70, batch: 0.08, modify: 0.12 }       // 被动：超高调用超低撤单
}

// Enhanced ABI for Pinger contract
const POKE_ABI = [
    { "inputs": [], "name": "poke", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "type": "uint256", "name": "price" }, { "type": "uint256", "name": "amount" }], "name": "pokeWithData", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "type": "uint256", "name": "price" }, { "type": "uint256", "name": "amount" }, { "type": "bool", "name": "isBuy" }], "name": "placeOrder", "outputs": [{ "type": "uint256", "name": "orderId" }], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "type": "uint256", "name": "orderId" }], "name": "cancelOrder", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "type": "uint256[]", "name": "amounts" }], "name": "batchPoke", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [], "name": "getMarketState", "outputs": [{ "type": "uint256", "name": "price" }, { "type": "uint256", "name": "volume" }, { "type": "uint256", "name": "totalOrders" }, { "type": "uint256", "name": "lastUpdate" }], "stateMutability": "view", "type": "function" }
]

// 简化的市场模拟状态
let marketState = {
    currentPrice: 1000n,
    priceHistory: [],
    volume: 0n,
    lastTradeTime: Date.now()
}

// 高级做市策略函数
async function executeSingleOrder(walletInstance, iface, nonce, orderId, fee, gasMultiplier, doCancel, doCall, walletIndex = 0) {
    const { wallet, provider, stats, proxyAgent } = walletInstance
    const startTime = Date.now()
    let to = wallet.address
    let value = 0n
    let data = '0x'
    let actionType = ''

    if (doCancel) {
        value = SPREAD_LEVELS[Math.floor(Math.random() * SPREAD_LEVELS.length)]
        actionType = 'cancel'
        stats.cancel++
        updateSimpleMarket('cancel', value)
        console.log(`[MM] 🔴 cancel OID=${orderId} price=${marketState.currentPrice} value=${value}wei`)
    } else if (doCall) {
        to = CONTRACT_ADDRESS
        data = iface.encodeFunctionData('poke', [])
        actionType = 'poke'
        stats.poke++
        updateSimpleMarket('poke', 1n)
        console.log(`[MM] 🔵 poke OID=${orderId} price=${marketState.currentPrice}`)
    } else {
        value = SPREAD_LEVELS[Math.floor(Math.random() * SPREAD_LEVELS.length)] + 1n
        actionType = 'place'
        stats.place++
        updateSimpleMarket('place', value)
        console.log(`[MM] 🟢 place OID=${orderId} price=${marketState.currentPrice} value=${value}wei`)
    }

    const tx = {
        to, value, data, nonce,
        gasLimit: doCall ? 200000n : 22000n,
        maxFeePerGas: BigInt(Math.floor(Number(fee.maxFeePerGas ?? 1n) * gasMultiplier)),
        maxPriorityFeePerGas: BigInt(Math.floor(Number(fee.maxPriorityFeePerGas ?? 1n) * gasMultiplier)),
        chainId: Number(CHAIN_ID),
        type: 2
    }

    const signed = await wallet.signTransaction(tx)
    const receipt = await rpc('realtime_sendRawTransaction', [signed], proxyAgent)
    const latency = Date.now() - startTime
    const success = receipt?.status === '0x1' ? '✅' : '❌'

    if (success === '✅') stats.success++
    console.log(`[MM W${walletIndex}] ${success} ${actionType} OID=${orderId} hash=${receipt?.transactionHash} latency=${latency}ms`)
}

async function executeBatchOrders(walletInstance, iface, nonce, orderId, fee, gasMultiplier, walletIndex = 0) {
    const { wallet, provider, stats, proxyAgent } = walletInstance

    // 随机批量大小 1-5笔
    const batchSize = Math.floor(Math.random() * 5) + 1
    console.log(`[MM W${walletIndex}] 📦 BATCH START OID=${orderId}-${orderId + batchSize - 1} (${batchSize}笔)`)
    const promises = []

    for (let i = 0; i < batchSize; i++) {
        const value = SPREAD_LEVELS[i % SPREAD_LEVELS.length]
        const tx = {
            to: wallet.address, value, data: '0x', nonce: nonce + i,
            gasLimit: 22000n,
            maxFeePerGas: BigInt(Math.floor(Number(fee.maxFeePerGas ?? 1n) * gasMultiplier)),
            maxPriorityFeePerGas: BigInt(Math.floor(Number(fee.maxPriorityFeePerGas ?? 1n) * gasMultiplier)),
            chainId: Number(CHAIN_ID), type: 2
        }

        promises.push(
            wallet.signTransaction(tx)
                .then(signed => rpc('realtime_sendRawTransaction', [signed], proxyAgent))
                .then(receipt => {
                    const success = receipt?.status === '0x1' ? '✅' : '❌'
                    if (success === '✅') stats.success++
                    console.log(`[MM W${walletIndex}] ${success} batch[${i}] OID=${orderId + i} hash=${receipt?.transactionHash}`)
                })
        )
    }

    await Promise.all(promises)
    stats.place += batchSize
    return batchSize
}

async function executeModifyOrder(walletInstance, iface, nonce, orderId, fee, gasMultiplier, walletIndex = 0) {
    const { wallet, provider, stats, proxyAgent } = walletInstance
    console.log(`[MM W${walletIndex}] 🔄 MODIFY OID=${orderId}-${orderId + 1}`)

    // 先撤单
    const cancelTx = {
        to: wallet.address, value: 1n, data: '0x', nonce,
        gasLimit: 22000n,
        maxFeePerGas: BigInt(Math.floor(Number(fee.maxFeePerGas ?? 1n) * gasMultiplier)),
        maxPriorityFeePerGas: BigInt(Math.floor(Number(fee.maxPriorityFeePerGas ?? 1n) * gasMultiplier)),
        chainId: Number(CHAIN_ID), type: 2
    }

    const cancelSigned = await wallet.signTransaction(cancelTx)
    const cancelReceipt = await rpc('realtime_sendRawTransaction', [cancelSigned], proxyAgent)

    // 再下单
    const placeTx = {
        to: wallet.address, value: 3n, data: '0x', nonce: nonce + 1,
        gasLimit: 22000n,
        maxFeePerGas: BigInt(Math.floor(Number(fee.maxFeePerGas ?? 1n) * gasMultiplier)),
        maxPriorityFeePerGas: BigInt(Math.floor(Number(fee.maxPriorityFeePerGas ?? 1n) * gasMultiplier)),
        chainId: Number(CHAIN_ID), type: 2
    }

    const placeSigned = await wallet.signTransaction(placeTx)
    const placeReceipt = await rpc('realtime_sendRawTransaction', [placeSigned], proxyAgent)

    const cancelSuccess = cancelReceipt?.status === '0x1' ? '✅' : '❌'
    const placeSuccess = placeReceipt?.status === '0x1' ? '✅' : '❌'

    if (cancelSuccess === '✅') stats.success++
    if (placeSuccess === '✅') stats.success++

    console.log(`[MM] ${cancelSuccess} cancel→${placeSuccess} place OID=${orderId}-${orderId + 1}`)
    stats.cancel++
    stats.place++
}

function showStats(stats) {
    const successRate = stats.total > 0 ? (stats.success / stats.total * 100).toFixed(1) : '0.0'
    console.log(`📊 [STATS] Total:${stats.total} Success:${successRate}% Place:${stats.place} Cancel:${stats.cancel} Poke:${stats.poke} Batch:${stats.batch} Modify:${stats.modify}`)
}

// 全局代理配置（已废弃，现在每个钱包独立配置代理）
// const proxyAgent = PROXY_URL ? createProxyAgent(PROXY_URL) : null

async function rpc(method, params = [], proxyAgent = null) {
    const fetchOptions = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
    }

    // 如果有代理，添加代理配置
    if (proxyAgent) {
        fetchOptions.agent = proxyAgent
    }

    const res = await fetch(HTTP_URL, fetchOptions)
    const data = await res.json()
    if (data.error) throw new Error(`${method} RPC error: ${JSON.stringify(data.error)}`)
    return data.result
}

// 创建SOCKS代理
function createProxyAgent(proxyUrl) {
    try {
        console.log(`🌐 创建SOCKS5代理: ${proxyUrl.replace(/\/\/.*@/, '//***@')}`)
        return new SocksProxyAgent(proxyUrl)
    } catch (error) {
        console.warn('⚠️ SOCKS代理创建失败:', error.message)
        return null
    }
}

// WebSocket订阅暂时被禁用，因为eth_subscribe方法不在白名单中
// function makeWs() {
//     const ws = new WebSocket(WS_URL)
//     ws.on('open', () => {
//         console.log('[WS] Connected')
//         ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_subscribe', params: ['miniBlocks'] }))
//         ws.send(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_subscribe', params: ['logs', { fromBlock: 'pending', toBlock: 'pending' }] }))
//     })
//     ws.on('message', (m) => {
//         try {
//             const d = JSON.parse(m.toString())
//             if (d.method === 'eth_subscription') {
//                 const r = d.params?.result
//                 if (r?.payload_id && r?.transactions) {
//                     console.log(`[miniBlocks] #${r.block_number}.${r.index} tx=${r.transactions.length}`)
//                 }
//             }
//         } catch { }
//     })
//     ws.on('close', () => setTimeout(makeWs, 2000))
// }
// makeWs()

// Fee数据缓存，减少重复getFeeData调用
let cachedFeeData = null
let feeDataCacheTime = 0
const FEE_CACHE_DURATION = 15000 // 15秒缓存

async function getCachedFeeData(provider) {
    const now = Date.now()
    if (cachedFeeData && (now - feeDataCacheTime) < FEE_CACHE_DURATION) {
        return cachedFeeData
    }

    cachedFeeData = await provider.getFeeData()
    feeDataCacheTime = now
    return cachedFeeData
}

// 解析分组钱包配置 
async function parseWalletConfig() {
    const wallets = []
    let walletIndex = 1
    const strategyNames = Object.keys(STRATEGIES)
    const useEncryption = process.env.USE_ENCRYPTION === 'true'

    console.log(`🔐 加密模式: ${useEncryption ? '启用' : '禁用'}`)

    // 扫描环境变量，查找所有 WALLET{N}_PRIVATE_KEY 格式
    const walletKeys = Object.keys(process.env).filter(key => key.match(/^WALLET\d+_PRIVATE_KEY$/))
    const walletNumbers = walletKeys.map(key => parseInt(key.match(/\d+/)[0])).sort((a, b) => a - b)

    for (const walletNum of walletNumbers) {
        const privateKeyVar = `WALLET${walletNum}_PRIVATE_KEY`
        const proxyVar = `WALLET${walletNum}_PROXY`
        const strategyVar = `WALLET${walletNum}_STRATEGY`

        let privateKey = process.env[privateKeyVar]

        // 如果启用加密，尝试解密私钥
        if (useEncryption) {
            try {
                console.log(`🔓 解密钱包${walletNum}私钥...`)
                privateKey = await deCryptText(privateKey.trim())
                if (!privateKey) {
                    console.error(`❌ 钱包${walletNum}私钥解密失败，跳过`)
                    continue
                }
                console.log(`✅ 钱包${walletNum}私钥解密成功`)
            } catch (error) {
                console.error(`❌ 钱包${walletNum}私钥解密失败:`, error.message)
                continue
            }
        }

        const proxyUrl = process.env[proxyVar] || null
        // 按顺序循环分配策略，如果手动指定了就用指定的
        const strategyName = process.env[strategyVar] || strategyNames[wallets.length % strategyNames.length]
        const strategy = STRATEGIES[strategyName] || STRATEGIES.balanced

        wallets.push({
            privateKey: privateKey.trim(),
            proxyUrl: proxyUrl ? proxyUrl.trim() : null,
            strategy: strategy,
            strategyName: strategyName,
            id: wallets.length, // 使用数组长度作为ID
            name: `W${walletNum}`
        })
    }

    // 如果没有找到分组配置，尝试兼容旧格式
    if (wallets.length === 0 && process.env.PRIVATE_KEY) {
        let privateKey = process.env.PRIVATE_KEY.trim()

        // 如果启用加密，尝试解密私钥
        if (useEncryption) {
            try {
                console.log(`🔓 解密主钱包私钥...`)
                privateKey = await deCryptText(privateKey)
                if (!privateKey) {
                    throw new Error('解密失败')
                }
                console.log(`✅ 主钱包私钥解密成功`)
            } catch (error) {
                console.error(`❌ 主钱包私钥解密失败:`, error.message)
                return []
            }
        }

        wallets.push({
            privateKey: privateKey,
            proxyUrl: process.env.PROXY_URL || null,
            strategy: STRATEGIES.balanced,
            strategyName: 'balanced',
            id: 0,
            name: 'W1'
        })
    }

    return wallets
}

async function createWalletInstance(config) {
    // 为每个钱包创建独立的代理
    const proxyAgent = config.proxyUrl ? createProxyAgent(config.proxyUrl) : null

    const provider = new ethers.JsonRpcProvider(HTTP_URL, {
        chainId: Number(CHAIN_ID),
        name: 'megaeth'
    })

    const wallet = new ethers.Wallet(config.privateKey, provider)
    const nonce = await provider.getTransactionCount(wallet.address, 'pending')

    return {
        wallet,
        provider,
        nonce,
        config,
        proxyAgent,
        stats: { total: 0, success: 0, cancel: 0, place: 0, poke: 0, batch: 0, modify: 0 }
    }
}

async function main() {
    const walletConfigs = await parseWalletConfig()
    console.log(`🤖 Advanced Market Making Bot Started`)
    console.log(`👥 Wallets: ${walletConfigs.length}`)
    console.log(`🌐 Proxies: ${walletConfigs.filter(c => c.proxyUrl).length}`)

    // 显示策略分布
    const strategyCount = {}
    walletConfigs.forEach(config => {
        strategyCount[config.strategyName] = (strategyCount[config.strategyName] || 0) + 1
    })
    const strategyInfo = Object.entries(strategyCount).map(([name, count]) => `${name}:${count}`).join(' ')
    console.log(`📊 Strategies: ${strategyInfo}`)

    // 显示第一个钱包的策略详情作为示例
    const firstStrategy = walletConfigs[0].strategy
    console.log(`📈 Sample Strategy: Cancel=${Math.round(firstStrategy.cancel * 100)}% Call=${Math.round(firstStrategy.call * 100)}% Batch=${Math.round(firstStrategy.batch * 100)}% Modify=${Math.round(firstStrategy.modify * 100)}%`)

    // 为每个钱包创建实例
    const walletInstances = await Promise.all(walletConfigs.map(createWalletInstance))

    // 显示钱包信息
    walletInstances.forEach((instance, i) => {
        const proxyInfo = instance.config.proxyUrl ? `via ${instance.config.proxyUrl.split('@')[1] || instance.config.proxyUrl}` : 'direct'
        const strategyInfo = `📊 ${instance.config.strategyName}`
        console.log(`💼 Wallet[${i}]: ${instance.wallet.address.slice(0, 8)}... ${proxyInfo} ${strategyInfo}`)
    })

    const iface = new ethers.Interface(POKE_ABI)
    let globalOrderId = 0
    let lastStatsTime = Date.now()

    // 并行运行所有钱包
    const walletPromises = walletInstances.map(async (instance, walletIndex) => {
        let localOrderId = walletIndex * 10000 // 避免订单ID冲突

        while (true) {
            try {
                const r = Math.random()

                // 使用钱包独立的策略决策
                const strategy = instance.config.strategy
                const doBatch = r < strategy.batch
                const doModify = r >= strategy.batch && r < strategy.batch + strategy.modify
                const doCancel = r >= strategy.batch + strategy.modify && r < strategy.batch + strategy.modify + strategy.cancel
                const doCall = CONTRACT_ADDRESS && r >= strategy.batch + strategy.modify + strategy.cancel && r < strategy.batch + strategy.modify + strategy.cancel + strategy.call

                const fee = await getCachedFeeData(instance.provider)

                // 智能Gas策略
                const gasRand = Math.random()
                const gasStrategy = gasRand < GAS_STRATEGY.urgent.ratio ? 'urgent' :
                    gasRand < GAS_STRATEGY.urgent.ratio + GAS_STRATEGY.normal.ratio ? 'normal' : 'slow'
                const gasMultiplier = GAS_STRATEGY[gasStrategy].multiplier

                if (doBatch) {
                    // 批量操作：连续发送多笔交易
                    const batchSize = await executeBatchOrders(instance, iface, instance.nonce, localOrderId, fee, gasMultiplier, walletIndex)
                    instance.nonce += batchSize
                    localOrderId += batchSize
                    instance.stats.batch++
                } else if (doModify) {
                    // 修改订单：先撤单再下单
                    await executeModifyOrder(instance, iface, instance.nonce, localOrderId, fee, gasMultiplier, walletIndex)
                    instance.nonce += 2
                    localOrderId += 2
                    instance.stats.modify++
                } else {
                    // 单笔操作
                    await executeSingleOrder(instance, iface, instance.nonce, localOrderId, fee, gasMultiplier, doCancel, doCall, walletIndex)
                    instance.nonce++
                    localOrderId++
                }

                instance.stats.total++
                globalOrderId++

                // 每30秒显示统计信息
                if (Date.now() - lastStatsTime > 30000) {
                    showAllStats(walletInstances)
                    lastStatsTime = Date.now()
                }
            } catch (e) {
                console.error(`[MM W${walletIndex} error]`, e.message)
                // 如果是nonce错误，重新同步nonce
                if (e.message.includes('nonce')) {
                    instance.nonce = await instance.provider.getTransactionCount(instance.wallet.address, 'pending')
                }
            }

            // 每个钱包独立的随机间隔
            await new Promise(r => setTimeout(r, TICK_MS + Math.floor(Math.random() * 80) + walletIndex * 50))
        }
    })

    // 等待所有钱包并行运行
    await Promise.all(walletPromises)
}

main().catch(console.error)

// 简化的市场状态更新函数
function updateSimpleMarket(action, amount) {
    const now = Date.now()

    // 简单的价格发现：根据操作类型微调价格
    if (action === 'place') {
        marketState.currentPrice += BigInt(Math.floor(Math.random() * 3)) // 0-2 wei上涨
    } else if (action === 'cancel') {
        if (marketState.currentPrice > 2n) {
            marketState.currentPrice -= BigInt(Math.floor(Math.random() * 2)) // 0-1 wei下跌
        }
    }

    // 记录交易量和时间
    marketState.volume += amount
    marketState.lastTradeTime = now

    // 保持价格历史（最近10个价格）
    marketState.priceHistory.push(Number(marketState.currentPrice))
    if (marketState.priceHistory.length > 10) {
        marketState.priceHistory.shift()
    }
}

// 显示所有钱包统计
function showAllStats(walletInstances) {
    console.log('📊 ===== MULTI-WALLET STATS =====')
    let totalStats = { total: 0, success: 0, cancel: 0, place: 0, poke: 0, batch: 0, modify: 0 }

    walletInstances.forEach((instance, i) => {
        const stats = instance.stats
        const successRate = stats.total > 0 ? (stats.success / stats.total * 100).toFixed(1) : '0.0'
        const proxyInfo = instance.config.proxyUrl ? '🌐' : '🔗'
        console.log(`💼 W${i} ${proxyInfo} ${instance.wallet.address.slice(0, 8)}... Total:${stats.total} Success:${successRate}% P:${stats.place} C:${stats.cancel} K:${stats.poke}`)

        // 累计总统计
        Object.keys(totalStats).forEach(key => totalStats[key] += stats[key])
    })

    const overallRate = totalStats.total > 0 ? (totalStats.success / totalStats.total * 100).toFixed(1) : '0.0'
    console.log(`🎯 TOTAL: ${totalStats.total} txs, ${overallRate}% success, Price: ${marketState.currentPrice}wei`)
    console.log('📊 ================================')
}