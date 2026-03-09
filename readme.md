# koishi-plugin-twitch

[![npm](https://img.shields.io/npm/v/koishi-plugin-twitch?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-twitch)
[![npm-download](https://img.shields.io/npm/dm/koishi-plugin-twitch?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-twitch)
[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/VincentZyuApps/koishi-plugin-twitch)
[![Gitee](https://img.shields.io/badge/Gitee-C71D23?style=for-the-badge&logo=gitee&logoColor=white)](https://gitee.com/vincent-zyu/koishi-plugin-twitch)

<p><del>💬 插件使用问题 / 🐛 Bug反馈 / 👨‍💻 插件开发交流，欢迎加入QQ群：<b>259248174</b>   🎉（这个群G了）</del></p> 
<p>💬 插件使用问题 / 🐛 Bug反馈 / 👨‍💻 插件开发交流，欢迎加入新QQ群：<b>1085190201</b> 🎉</p>
<p>💡 在群里直接艾特我，回复的更快哦~ ✨</p>

---

📺 **Twitch 直播推送插件** - 订阅你喜欢的 Twitch 主播，开播时自动推送通知到 QQ 群！

## ✨ 功能特点

- 🔔 **开播提醒**：自动检测主播开播状态，第一时间推送通知
- 🎨 **多种消息格式**：支持纯文字、Puppeteer 渲染图片、原始图片、合并转发等多种形式
- 📋 **多主播订阅**：支持同时订阅多个主播，分别推送到不同的群
- 🌐 **代理支持**：支持 HTTP/HTTPS/SOCKS5 代理，解决网络问题
- ⏰ **定时轮询**：可自定义轮询间隔，灵活配置

## 📸 效果预览

### CS 比赛直播 - 图文/图片/合并转发三种效果展示
![cs比赛直播效果](doc/cs比赛直播-图文-图片-合并转发三种效果展示捏.png)

### 可爱甘城猫猫推送效果~
![甘城猫猫直播推送效果](doc/nacho_dayo直播捏-群里面效果捏.png)

## 📦 安装

在 Koishi 插件市场搜索并安装 `twitch`

或者使用命令行：
```bash
# npm
npm install koishi-plugin-twitch

# yarn
yarn add koishi-plugin-twitch
```

## ⚙️ 配置说明

### 🔑 获取 Twitch API 凭证

1. 前往 [Twitch 开发者控制台](https://dev.twitch.tv/console/apps) 注册应用
2. 获取 `Client ID` 和 `Client Secret`
3. 在插件配置中填入对应的值

### 📋 配置项

| 配置项 | 说明 | 默认值 |
|:---|:---|:---|
| `msgFormArr` | 消息发送形式（可多选） | `puppeteer_image` |
| `quoteWhenSend` | 发消息时带引用 | `true` |
| `localTimezoneOffset` | 本地时区偏移量 | `+8` |
| `clientId` | Twitch API Client ID | - |
| `clientSecret` | Twitch API Client Secret | - |
| `secret` | 验证密钥（10-20位随机字符串） | - |
| `pollCron` | 轮询 Cron 表达式 | `0,30 * * * * *` |
| `subscribeList` | 订阅的主播列表 | `[]` |
| `proxy` | 代理配置 | - |

### 📨 消息形式说明

- 📝 **text** - 纯文本，只发送文字信息
- 🎨 **puppeteer_image** - Puppeteer 渲染模板图，精美卡片样式
- 🖼️ **raw_image** - 原始头像+封面图，直接发送直播间图片
- 📦 **forward** - 合并转发，仅适用于 OneBot 平台

## 📖 使用方法

### 指令列表

```
twitch                    # 查看帮助
twitch.sub <username>     # 订阅主播
twitch.unsub <username>   # 取消订阅
twitch.list               # 查看订阅列表
twitch.check <username>   # 手动查询主播直播状态
```

## 🌐 代理配置

由于 Twitch API 需要访问外网，如果网络不通，可以配置代理：

```yaml
proxy:
  enabled: true
  protocol: socks5  # 支持 http/https/socks4/socks5/socks5h
  host: 127.0.0.1
  port: 7890
```

## 📝 更新日志

- **0.0.4-beta.1+20260310**
  - 🎉 首个公开测试版本
  - ✨ 支持多种消息发送形式
  - ✨ 支持多主播订阅
  - ✨ 支持代理配置

## ⚠️ 注意事项

1. 需要安装 `puppeteer` 服务才能使用渲染图片功能
2. 合并转发功能仅支持 OneBot 平台
3. 建议配置代理以确保 API 访问稳定
