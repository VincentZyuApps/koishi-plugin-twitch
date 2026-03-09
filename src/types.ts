//types.ts
// Twitch API 基础 URL
export const TWITCH_API_BASE_URL = 'https://api.twitch.tv/helix';
export const TWITCH_OAUTH_URL = 'https://id.twitch.tv/oauth2/token';

// 新增：代理协议类型
export const PROXY_PROTOCOL = {
  HTTP: 'http',
  HTTPS: 'https',
  SOCKS4: 'socks4',
  SOCKS5: 'socks5',
  SOCKS5H: 'socks5h',
} as const;
export type ProxyProtocolType = typeof PROXY_PROTOCOL[keyof typeof PROXY_PROTOCOL];

export const MSG_FORM = {
  TEXT: 'text',
  PUPPETEER_IMAGE: 'puppeteer_image',
  RAW_IMAGE: 'raw_image',
  FORWARD: 'forward',
} as const;

export interface LiveInfo {
    user_name: string,
    title: string,
    started_at: string,
    game_name: string,
    viewer_count: number,
    user_login: string,
    url: string,
    profile_image_url: string,
    thumbnail_url: string,
}

// ==================== 📝 Usage 文档 ====================

export function createUsage(pluginName: string, version: string): string {
    return `
<h1>📺 Koishi 插件: Twitch 直播推送 ${pluginName} 📺</h1>
<h2>🎯 插件版本：v${version}</h2>

<h2 style="color: #9146FF; font-weight: 900; font-size: 24px; margin: 20px 0;">⚠️ 重要提示：需要开启 <b>puppeteer</b> 和 <b>database</b> 服务，本插件才能正常使用捏！</h2>

<p><del>💬 插件使用问题 / 🐛 Bug反馈 / 👨‍💻 插件开发交流，欢迎加入QQ群：<b>259248174</b>   🎉（这个群G了</del> </p> 
<p>💬 插件使用问题 / 🐛 Bug反馈 / 👨‍💻 插件开发交流，欢迎加入QQ群：<b>1085190201</b> 🎉</p>
<p>💡 在群里直接艾特我，回复的更快哦~ ✨</p>

<hr>

<h3>✨ 主要功能</h3>
<ul>
  <li>🔔 <b>开播/下播自动推送</b> - 订阅喜欢的主播，开播时自动通知</li>
  <li>🖼️ <b>多种消息格式</b> - 支持文字、图片、合并转发等多种形式</li>
  <li>⏰ <b>定时轮询检测</b> - 可自定义检测间隔（cron 表达式）</li>
  <li>📢 <b>多平台多频道</b> - 一个主播可推送到多个群/频道</li>
  <li>🌐 <b>代理支持</b> - 支持 HTTP/HTTPS/SOCKS5 代理配置</li>
  <li>⚡ <b>性能优化</b> - Token 缓存 + 批量查询，减少 API 调用</li>
</ul>

<hr>

<h3>📖 指令列表</h3>
<table>
  <tr><th>指令</th><th>说明</th></tr>
  <tr><td><code>tw</code></td><td>查看帮助信息</td></tr>
  <tr><td><code>tw.check [主播名]</code></td><td>查询指定主播的直播状态</td></tr>
  <tr><td><code>tw.config</code></td><td>查看当前频道的订阅配置</td></tr>
  <tr><td><code>tw.all</code></td><td>查看所有订阅主播的状态</td></tr>
</table>

<hr>

<h3>🚀 快速开始</h3>
<ol>
  <li>📝 前往 <a href="https://dev.twitch.tv/console/apps">Twitch 开发者控制台</a> 创建应用，获取 <code>Client ID</code> 和 <code>Client Secret</code></li>
  <li>⚙️ 在插件配置中填入凭证信息</li>
  <li>➕ 在「订阅列表」中添加要关注的主播和推送频道</li>
  <li>✅ 保存配置，插件将自动开始轮询检测</li>
</ol>

<hr>

<h3>⚠️ 注意事项</h3>
<ul>
  <li>🖼️ 需要安装 <code>puppeteer</code> 服务才能使用渲染图片功能</li>
  <li>📨 合并转发功能仅支持 <b>OneBot</b> 平台</li>
  <li>🌐 建议配置代理以确保 Twitch API 访问稳定</li>
  <li>🔑 请妥善保管 Client Secret，避免泄露</li>
</ul>

<hr>

<h3>📜 插件许可声明</h3>
<p>🆓 本插件为开源免费项目，基于 MIT 协议开放。欢迎修改、分发、二创。🎉</p>
<p>⭐ 如果你觉得插件好用，欢迎在 GitHub 上 Star 或通过其他方式给予支持！💖</p>
`;
}