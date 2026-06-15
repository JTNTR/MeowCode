# 喵喵二维码 (Meow QR Code)

微信小程序项目，基于微信云开发模板 (quickstart-wx-cloud)。

## 项目定位

一款趣味 + 工具型的二维码小程序，核心功能是二维码扫描与生成，并融入星座运势等趣味模块。

## 技术栈

- **前端**: 微信小程序原生框架 (WXML + WXSS + JS)，无 npm 依赖
- **后端**: 微信云开发 (CloudBase)，含云函数、云数据库、云存储
- **AppID**: `wxa320d3fdbf91cb99`
- **基础库版本**: 2.20.1+
- **Canvas**: 使用 Canvas 2D API (`type="2d"`)，所有图片导出通过 Canvas 绘制
- **样式风格**: 粉色系 (#FF6B8A)，暖色调背景 (#FFF5F0)，猫猫可爱主题，emoji 图标

## 目录结构

```
miniprogram/
├── app.js              # 小程序入口，云开发初始化
├── app.json            # 全局配置（页面路由在此注册）
├── app.wxss            # 全局样式（CSS变量、按钮、表单、结果区）
├── pages/
│   ├── index/          # 首页（2列网格布局的功能卡片）
│   ├── scan/           # 扫码页（条形码/二维码扫描）
│   ├── generate/       # 生成页（条形码/二维码生成 + Canvas导出）
│   └── horoscope/      # 星座运势页（今日运势 + Canvas图片直存相册）
├── components/
│   └── cloudTipModal/  # 云开发提示弹窗组件（当前未使用）
├── utils/
│   ├── barcode.js      # 条形码生成库（CODE128/CODE39/EAN-13）
│   ├── qrcode.js       # 二维码生成库（正方形/圆角/圆形模块）
│   └── horoscope.js    # 星座运势计算引擎（纯客户端，种子随机数）
└── images/             # 图片资源（含icons子目录）

cloudfunctions/
└── quickstartFunctions/  # 云函数（OpenID获取、增删改查等）
```

## 页面路由表

| 路由 | 名称 | 说明 |
|------|------|------|
| pages/index/index | 首页 | 2列网格功能卡片入口 |
| pages/scan/scan | 扫码 | 扫描条形码/二维码 |
| pages/generate/generate | 生成 | 生成条形码/二维码 + Canvas导出 |
| pages/horoscope/horoscope | 星座运势 | 十二星座运势 + Canvas图片直存 |

## 关键约定

### 新增页面必须做两步
1. 在 `miniprogram/app.json` 的 `pages` 数组中注册路由
2. 页面文件放在 `miniprogram/pages/<name>/` 下，包含 `.js` `.json` `.wxml` `.wxss` 四个文件

### 代码风格
- 纯 ES5/ES6 JavaScript，不使用 TypeScript
- 模块系统使用 CommonJS (`require`/`module.exports`)
- 页面内 `var self = this` 模式保持回调中的 this 引用
- Canvas 逻辑尺寸 400px 宽，导出时 2x 分辨率 (800px)
- WXSS 使用 `rpx` 响应式单位（750rpx = 屏幕宽度）
- 全局样式变量定义在 `app.wxss` 的 `page` 选择器中

### Canvas 导出模式
- 隐藏 Canvas 节点（`position:fixed; left:-9999px`），仅用于离屏渲染
- 先计算内容高度 → 设置 Canvas 尺寸 → 绘制 → `canvasToTempFilePath` 导出
- 导出图片直接保存到相册，不展示中间预览

### 星座运势引擎 (`utils/horoscope.js`)
- **纯客户端计算**，无后端依赖
- 基于 `日期 × 星座ID` 的确定性种子随机数，同一天同一星座结果固定
- 导出: `SIGNS`, `getSignByBirthday()`, `getCurrentSign()`, `getDailyFortune()`, `seededRandom()`, `toStars()`, `toStarsArray()`
- 12个星座完整数据，含日期范围、元素、守护星、性格特征
- 4个运势维度: 爱情(love)、事业(career)、健康(health)、财富(wealth)
- 评分范围 1.0-5.0，附带高/中/低三档文案库、幸运色/数字/方位、每日箴言
- `toStarsArray(score)` 返回 `['full','half','empty',...]` 数组供页面逐颗渲染

### 星星渲染规则
- WXML 和 Canvas **统一使用 ★ 字符**，不混用 ☆/⭑（渲染尺寸不一致）
- 通过颜色区分状态：实星 `#FFA940`，空星 `#E8E0D8`，半星与实星同色
- Canvas 中逐颗 `fillText('★')`，WXML 中用 `wx:for` 逐颗 `<text>` 渲染

### 云开发
- 环境ID在 `app.js` 的 `globalData.env` 中配置（当前为空，需开发者自行填写）
- 云函数目录: `cloudfunctions/quickstartFunctions/`

## 当前状态

- 5个页面全部注册：index、scan、generate、horoscope，example 已删除
- `cloudTipModal` 组件保留但无页面引用（如后续不需要可删除）
- 首页使用 2列网格布局，新增功能卡片只需加一个 `<view class="card card-新颜色">` 块
