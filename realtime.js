import 'dotenv/config'
import { WebSocket } from 'ws'
import { ethers } from 'ethers'

const { PRIVATE_KEY, HTTP_URL, WS_URL, CHAIN_ID, CONTRACT_ADDRESS } = process.env

const POKE_ABI = [{ "inputs": [], "name": "poke", "outputs": [], "stateMutability": "nonpayable", "type": "function" }]

async function rpc(method, params = []) {
    const res = await fetch(HTTP_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
    })
    const data = await res.json()
    if (data.error) throw new Error(`${method} RPC error: ${JSON.stringify(data.error)}`)
    return data.result
}

function makeWs() {
    const ws = new WebSocket(WS_URL)
    ws.on('open', () => {
        console.log('[WS] Connected')
        ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_subscribe', params: ['miniBlocks'] }))
        ws.send(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_subscribe', params: ['logs', { fromBlock: 'pending', toBlock: 'pending' }] }))
    })
    ws.on('message', (m) => {
        try {
            const d = JSON.parse(m.toString())
            if (d.method === 'eth_subscription') {
                const r = d.params?.result
                if (r?.payload_id && r?.transactions) {
                    console.log(`[miniBlocks] #${r.block_number}.${r.index} tx=${r.transactions.length}`)
                }
            }
        } catch { }
    })
    ws.on('close', () => setTimeout(makeWs, 2000))
}
makeWs()

async function main() {
    const provider = new ethers.JsonRpcProvider(HTTP_URL, {
        chainId: Number(CHAIN_ID),
        name: 'megaeth'
    })
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
    const iface = new ethers.Interface(POKE_ABI)

    let currentNonce = await provider.getTransactionCount(wallet.address, 'pending')

    while (true) {
        try {
            const startTime = Date.now()
            const fee = await provider.getFeeData()

            const tx = {
                to: CONTRACT_ADDRESS,
                data: iface.encodeFunctionData('poke', []),
                nonce: currentNonce,
                gasLimit: 200000n,
                maxFeePerGas: fee.maxFeePerGas ?? 1n,
                maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? 1n,
                chainId: Number(CHAIN_ID),
                type: 2
            }

            const signed = await wallet.signTransaction(tx)
            const receipt = await rpc('realtime_sendRawTransaction', [signed])
            const latency = Date.now() - startTime
            const success = receipt?.status === '0x1' ? '✅' : '❌'
            console.log(`[poke] ${success} hash=${receipt?.transactionHash} latency=${latency}ms nonce=${currentNonce}`)
            currentNonce++ // 成功发送后递增nonce
        } catch (e) {
            console.error('[poke error]', e.message)
            // 如果是nonce错误，重新同步nonce
            if (e.message.includes('nonce')) {
                currentNonce = await provider.getTransactionCount(wallet.address, 'pending')
            }
        }

        await new Promise(r => setTimeout(r, 800 + Math.random() * 200)) // 高频间隔
    }
}

main().catch(console.error)
