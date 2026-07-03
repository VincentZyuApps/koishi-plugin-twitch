// Twitch 插件在 Koishi 控制台里展示的 usage HTML。
export function createUsage(pluginName: string, version: string): string {
    return `
<h1>📺 Koishi 插件: Twitch 直播推送 ${pluginName} 📺</h1>
<h2>🎯 插件版本：v${version}</h2>

<p>
  <a href="https://www.npmjs.com/package/koishi-plugin-twitch" target="_blank">
    <img src="https://img.shields.io/npm/v/koishi-plugin-twitch?style=flat-square" alt="npm version">
  </a>
  <a href="https://www.npmjs.com/package/koishi-plugin-twitch" target="_blank">
    <img src="https://img.shields.io/npm/dm/koishi-plugin-twitch?style=flat-square" alt="npm downloads">
  </a>
  <br>
  <a href="https://github.com/VincentZyuApps/koishi-plugin-twitch" target="_blank">
    <img src="https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub">
  </a>
  <a href="https://gitee.com/vincent-zyu/koishi-plugin-twitch" target="_blank">
    <img src="https://img.shields.io/badge/Gitee-C71D23?style=for-the-badge&logo=gitee&logoColor=white" alt="Gitee">
  </a>
  <br>
  <a href="https://forum.koishi.xyz/t/topic/12364" target="_blank">
    <img src="https://img.shields.io/badge/Koishi%20Forum-12364-5546A3?style=for-the-badge&logo=https%3A%2F%2Fupload.wikimedia.org%2Fwikipedia%2Fcommons%2Ff%2Ff3%2FKoishi.js_Logo.png&logoColor=white" alt="Koishi Forum">
  </a>
  <a href="https://qm.qq.com/q/ZN7fxZ3qCq" target="_blank">
    <img src="https://img.shields.io/badge/QQ群-1085190201-12B7F5?style=flat-square&logo=qq&logoColor=white" alt="QQ群">
  </a>
  <br>
</p>

<h2 style="color: #9146FF; font-weight: 900; font-size: 24px; margin: 20px 0;">⚠️ 重要提示：需要开启 <b>puppeteer</b> 和 <b>database</b> 服务，本插件才能正常使用捏！</h2>

<h2>💬 交流反馈</h2>
<p>🐛 Bug 反馈 / 💡 建议 / 👨‍💻 插件开发交流，欢迎加群：</p>
<p><del>💬 插件使用问题 / 🐛 Bug反馈 / 👨‍💻 插件开发交流，欢迎加入QQ群：<b>259248174</b>   🎉（这个群G了）</del></p> 
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
