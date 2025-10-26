# 加解密模块

本模块通过结合1Password，用于加解密文本。之所以采用1Password，是因为加解密时可以用指纹操作，解锁1Password，获取存储的密码，然后执行加解密操作，避免了每次手输密码的繁琐。兼顾安全和便捷。

加解密使用`crypto`库的`aes-256-gcm`算法，使用随机初始化向量，确保数据在传输或存储过程中的唯一性、保密性和完整性。此模式提供了高效的认证和加密，因此被认为是最好的加密模式之一。

> 1Password中的密码切不可泄露，否则等于没加密！

## 配置步骤

### 1️⃣ 安装1Password CLI
```bash
# macOS
brew install --cask 1password-cli

# 其他系统请参考：https://1password.com/downloads/command-line/
```

### 2️⃣ 配置1Password
1. 在1Password中创建一个密码项目
2. 复制该项目的引用路径（如：`op://Private/MegaETH/password`）
3. 在`.env`中配置：`personalToken=op://Private/MegaETH/password`
4. 客户端需要勾选`设置->开发者->与1Password CLI 集成`选项

### 3️⃣ 加密私钥
```bash
# 方式1: 交互模式（推荐） - 支持多行私钥
node crypt/encrypt-keys.js
# 然后粘贴多行私钥，每行一个，完成后按回车（空行）结束

# 方式2: 参数模式 - 直接传入私钥
node crypt/encrypt-keys.js "0x你的私钥1" "0x你的私钥2" "0x你的私钥3"
```

### 4️⃣ 启用加密模式
在`.env`中设置：
```bash
USE_ENCRYPTION=true
WALLET1_PRIVATE_KEY=6f74035f8943b525741079695xxxxxxxxxxxxxxxxxxxxxxxxxxxa72ec91bb37156e4a277578
WALLET2_PRIVATE_KEY=a7002ad8dfd7451fe1f53579bxxxxxxxxxxxxxxxxxxxxxxxxxxxabde77832acb53db1b5ebf1
```
