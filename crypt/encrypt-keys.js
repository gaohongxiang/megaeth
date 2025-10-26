#!/usr/bin/env node
import 'dotenv/config'
import { enCryptText } from './crypt.js'
import { createInterface } from 'readline'

/**
 * 私钥加密工具
 * 支持两种模式：
 * 1. 参数模式：node crypt/encrypt-keys.js "0x私钥1" "0x私钥2"
 * 2. 交互模式：node crypt/encrypt-keys.js （然后粘贴多行私钥）
 */

async function main() {
    console.log('🔐 私钥加密工具')
    console.log('================')

    // 检查是否配置了1Password令牌
    if (!process.env.personalToken) {
        console.error('❌ 请先在.env文件中配置personalToken')
        console.log('示例: personalToken=op://Private/MegaETH/password')
        process.exit(1)
    }

    const args = process.argv.slice(2)
    let privateKeys = []

    // 显示帮助信息
    if (args.includes('--help') || args.includes('-h')) {
        console.log('📖 使用方法:')
        console.log('1. 参数模式: node crypt/encrypt-keys.js "0x私钥1" "0x私钥2"')
        console.log('2. 交互模式: node crypt/encrypt-keys.js')
        console.log('   然后粘贴多行私钥，每行一个，输入完成后按回车（空行）结束')
        console.log('\n📝 示例:')
        console.log('node crypt/encrypt-keys.js "0xbcd00cbd7b5ea49f99879a073684572977c5d56c7862a52ade17f0ab611e8923"')
        process.exit(0)
    }

    if (args.length === 0) {
        // 交互模式 - 从标准输入读取多行私钥
        console.log('📝 交互模式 - 请粘贴私钥（每行一个）')
        console.log('💡 输入完成后，直接按回车（空行）结束输入')
        console.log('---')

        const rl = createInterface({
            input: process.stdin,
            output: process.stdout
        })

        privateKeys = await new Promise((resolve) => {
            const keys = []
            rl.on('line', (line) => {
                const trimmed = line.trim()
                if (trimmed === '') {
                    // 空行表示输入结束
                    rl.close()
                    resolve(keys)
                } else {
                    keys.push(trimmed)
                    console.log(`✓ 已添加私钥 ${keys.length}`)
                }
            })
        })

        console.log(`\n收到 ${privateKeys.length} 个私钥`)
    } else {
        // 参数模式 - 使用命令行传入的私钥
        privateKeys = args
    }

    if (privateKeys.length === 0) {
        console.log('❌ 没有收到任何私钥')
        process.exit(1)
    }

    console.log(`正在加密 ${privateKeys.length} 个私钥...\n`)

    const results = []

    for (let i = 0; i < privateKeys.length; i++) {
        const privateKey = privateKeys[i]

        // 验证私钥格式
        if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
            console.log(`❌ 钱包${i + 1}: 私钥格式错误 (${privateKey})`)
            continue
        }

        try {
            const encryptedKey = await enCryptText(privateKey)
            const result = {
                index: i + 1,
                original: privateKey,
                encrypted: encryptedKey,
                config: `WALLET${i + 1}_PRIVATE_KEY=${encryptedKey}`
            }

            results.push(result)

            console.log(`✅ 钱包${i + 1}:`)
            console.log(`   原始私钥: ${privateKey}`)
            console.log(`   加密私钥: ${encryptedKey}`)
            console.log(`   配置示例: ${result.config}`)
            console.log('---')
        } catch (error) {
            console.error(`❌ 钱包${i + 1}加密失败:`, error.message)
        }
    }

    // 输出汇总
    console.log('\n🎉 加密完成汇总:')
    console.log(`✅ 成功加密: ${results.length} 个私钥`)
    console.log(`❌ 失败/跳过: ${privateKeys.length - results.length} 个`)

    if (results.length > 0) {
        console.log('\n📋 .env 配置模板:')
        console.log('USE_ENCRYPTION=true')
        results.forEach(result => {
            console.log(result.config)
        })
    }

    console.log('\n📝 使用说明:')
    console.log('1. 将上述配置复制到 .env 文件')
    console.log('2. 确保设置 USE_ENCRYPTION=true')
    console.log('3. 运行 node realtime.js 启动机器人')
}

main().catch(console.error)