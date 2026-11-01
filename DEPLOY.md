# 部署指南

本项目是**零依赖 Node.js** 应用（`node src/server.js` 即可启动），天然适合容器化部署到 Render / Railway / Fly.io / 阿里云 / 腾讯云等。

## 一、本地跑通（开发/演示）
```bash
cd domestic-shop
node src/server.js        # 默认 mock 模式，无需任何商户号
# 打开 http://localhost:3000
```

## 二、容器化部署（推荐，最简单）
已提供 `Dockerfile` 与 `render.yaml`，任选其一：

### 方式 A：Render（免费、最省事）
1. 登录 https://render.com → New → Blueprint → 关联本 GitHub 仓库
2. Render 读取 `render.yaml`，自动创建 Web 服务（免费实例）
3. 部署完成后获得 `https://domestic-shop-xxx.onrender.com`
4. 如需真实收款：在 Render 环境变量里把 `PAYMENT_MODE` 改为 `wechat`/`alipay`，并填入对应密钥（见 README 第 4 节）

### 方式 B：Railway / Fly.io / 任意云平台
```bash
docker build -t domestic-shop .
docker run -p 3000:3000 -e PAYMENT_MODE=mock domestic-shop
```

### 方式 C：国内云（阿里云/腾讯云 轻量应用服务器）
- 安装 Docker，上传仓库后 `docker compose up -d`（或用 `node src/server.js` 直接运行）
- **国内站点必须**：绑定**已 ICP 备案的域名** + 配置 HTTPS（ Let's Encrypt 或云厂商免费证书）

## 三、上线前必须补齐（生产 readiness）
| 项目 | 当前状态 | 上线要求 |
| - | - | - |
| 支付 | mock 可跑通 | 填商户号/APIv3 密钥，回调用**公网 HTTPS+备案域名** |
| 存储 | JSON 文件 | 换数据库（Postgres/MySQL），多实例下文件存储不安全 |
| HTTPS | 无 | 云厂商/Let's Encrypt 免费证书 |
| 合规 | 见 README | 营业执照→ICP备案→ICP经营许可证（自营无需EDI）→公安备案 |
| 域名 | 无 | 国内必须备案域名；可加 SEO/短信/限流/风控 |

## 四、注意
- `data/` 与 `.env` 已在 `.gitignore` 中排除，**不会**随仓库泄露测试订单与密钥。
- 免费实例（如 Render free）会休眠，首次访问需冷启动数秒，属正常现象。
