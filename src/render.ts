// render.ts
import { Context } from 'koishi';
import { } from 'koishi-plugin-puppeteer';
import { LiveInfo } from './types';


const getTemplateStr = (
    liveInfoPayload: LiveInfo,
    coverImageUrl: string,
    profileImageUrl: string
): string => {
    return `
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body {
          margin: 0;
          padding: 0;
          font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
          background: #000;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh; /* 确保body有足够高度来居中内容 */
        }

        .background-container {
          position: fixed;
          top: 0; left: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          z-index: 1;
        }

        .background-cover {
          width: 100%;
          height: 100%;
          object-fit: cover; /* 确保图片覆盖整个容器，没有留白 */
          filter: blur(30px) brightness(0.5);
          transform: scale(1.05); /* 稍微放大一点防止模糊边缘出现空隙 */
        }

        .main-container {
          position: relative;
          z-index: 2;
          display: flex;
          justify-content: center; /* 水平居中 */
          align-items: center;   /* 垂直居中 */
          width: 100%;
          height: 100vh; /* 撑开到视口高度 */
          padding: 32px;
          box-sizing: border-box; /* 包含padding在内的尺寸 */
        }

        .card {
          width: 90%; /* 使卡片更宽 */
          max-width: 800px; /* 限制最大宽度 */
          border-radius: 24px;
          overflow: hidden;

          background: rgba(30, 30, 40, 0.6);
          backdrop-filter: blur(20px) saturate(160%);
          -webkit-backdrop-filter: blur(20px) saturate(160%);
          border: 1px solid rgba(255, 255, 255, 0.12);

          box-shadow: 0 8px 32px rgba(0,0,0,0.5);

          display: flex;
          flex-direction: column;
        }

        .cover-container {
          position: relative;
          width: 100%;
          padding-bottom: 56.25%; /* 16:9 */
          background-color: #1a1a1f; /* 封面加载前的背景色 */
        }

        .cover {
          position: absolute;
          top: 0; left: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .info {
          padding: 24px 28px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          color: #fff;
        }

        .user {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .avatar {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          border: 2px solid #9147ff;
          object-fit: cover;
        }

        .username {
          font-size: 1.4em;
          font-weight: bold;
        }

        .game {
          font-size: 1em;
          color: #cfcfcf;
        }

        .title {
          font-size: 1.2em;
          font-weight: 600;
          color: #fff;
        }

        .time, .viewers { /* 新增 .viewers 样式 */
          font-size: 0.95em;
          color: #bdbdbd;
        }

        .link {
          margin-top: 10px;
          font-size: 0.95em;
          color: #9147ff;
          text-decoration: none;
          font-weight: 600;
          display: flex;
          align-items: center;
        }
        
        .link::before {
            content: '▶'; /* 播放图标 */
            margin-right: 5px;
        }

        .link:hover {
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <div class="background-container">
        <img class="background-cover" id="background-cover" src="${profileImageUrl}" alt="背景封面"/>
      </div>
      <div class="main-container">
        <div class="card">
          <div class="cover-container">
            <img class="cover" id="cover-image" src="${coverImageUrl}" alt="直播封面"/>
          </div>
          <div class="info">
            <div class="user">
              <img class="avatar" id="avatar-image" src="${profileImageUrl}" alt="头像"/>
              <span class="username">${liveInfoPayload.user_name}</span>
            </div>
            <div class="game">${liveInfoPayload.game_name}</div>
            <div class="title">${liveInfoPayload.title}</div>
            <div class="time">开播时间：${liveInfoPayload.started_at.replace('T', ' ').replace('Z', '')}</div>
            <div class="viewers">观看人数：${liveInfoPayload.viewer_count}</div> <a class="link" href="${liveInfoPayload.url}">前往直播间</a>
          </div>
        </div>
      </div>
    </body>
    </html>
    `;
};


/**
 * 渲染Twitch直播卡片图片，现代风格（磨砂玻璃+圆角）
 */
export async function renderLiveImage(ctx: Context, liveInfoPayload: LiveInfo, coverImageUrl: string, profileImageUrl: string) {
    if (!ctx.puppeteer) {
        ctx.logger.error("Puppeteer service is not available.");
        return null;
    }

    const page = await ctx.puppeteer.page();

    try {
        const html = getTemplateStr(liveInfoPayload, coverImageUrl, profileImageUrl);

        // 设置一个更大的视口，以适应更宽的卡片布局
        await page.setViewport({ width: 1000, height: 800 }); // 调整视口大小

        await page.setContent(html, {
            waitUntil: ['domcontentloaded']
        });
        
        // 等待所有图片加载完成（通过检查 ID）
        await page.waitForFunction(() => {
            const avatar = document.getElementById('avatar-image') as HTMLImageElement;
            const cover = document.getElementById('cover-image') as HTMLImageElement;
            const backgroundCover = document.getElementById('background-cover') as HTMLImageElement;
            return avatar.complete && cover.complete && backgroundCover.complete;
        }, { timeout: 15000 });

        // 获取整个body的尺寸，然后进行截图
        const bodyHandle = await page.$('body');
        const boundingBox = await bodyHandle.boundingBox();
        if (boundingBox) {
            // 计算截图区域，稍微扩大一点以包含阴影或边框
            const screenshot = await page.screenshot({
                type: 'png',
                encoding: 'base64',
                clip: {
                    x: boundingBox.x,
                    y: boundingBox.y,
                    width: boundingBox.width,
                    height: boundingBox.height,
                },
            });
            return screenshot;
        } else {
            ctx.logger.error('Could not get bounding box for body.');
            return null;
        }

    } catch (err) {
        ctx.logger.error('Error rendering Twitch stream image:', err);
        return null;
    } finally {
        await page.close();
    }
}