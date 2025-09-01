import base64
import os

def main():
    # 读取 tmp.txt
    with open("tmp.txt", "r", encoding="utf-8") as f:
        data_url = f.read().strip()

    # 检查 data URL 格式
    if not data_url.startswith("data:"):
        raise ValueError("文件内容不是 data URL 格式")

    # 分离头部 (data:image/jpeg;base64,) 和真正的 base64 数据
    header, base64_data = data_url.split(",", 1)

    # 自动识别扩展名
    if "image/png" in header:
        ext = "png"
    elif "image/jpeg" in header or "image/jpg" in header:
        ext = "jpg"
    else:
        ext = "bin"  # 兜底

    # 解码 base64
    img_bytes = base64.b64decode(base64_data)

    # 保存到同级目录
    out_file = f"output.{ext}"
    with open(out_file, "wb") as f:
        f.write(img_bytes)

    print(f"✅ 已保存图片: {out_file}")

if __name__ == "__main__":
    main()
