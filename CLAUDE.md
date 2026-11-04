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
│   ├── horoscope/      # 星座运势页（今日运势 + Canvas图片直存相册）
│   ├── watermark/      # 图片水印页
│   ├── game/           # 游戏中心（功能入口列表）
│   └── cube/           # 3D 魔方（拖动转层 + 层先法复原教程）
├── components/
│   └── cloudTipModal/  # 云开发提示弹窗组件（当前未使用）
├── utils/
│   ├── barcode.js      # 条形码生成库（CODE128/CODE39/EAN-13）
│   ├── qrcode.js       # 二维码生成库（正方形/圆角/圆形模块）
│   ├── horoscope.js    # 星座运势计算引擎（纯客户端，种子随机数）
│   ├── cube.js         # 魔方状态模型（N 阶，含镜面魔方）
│   ├── cubeTables.js   # 3 阶面块置换表 PERM
│   ├── cubeSolver.js   # 层先法求解器（输出分阶段步骤）
│   └── cubeRender.js   # 魔方 3D 渲染（Canvas 2D，画家算法）
└── images/             # 图片资源（含icons子目录）

cloudfunctions/
├── quickstartFunctions/  # 云函数（OpenID获取、增删改查等）
└── watermarkParser/      # 图片水印解析云函数
```

## 页面路由表

| 路由 | 名称 | 说明 |
|------|------|------|
| pages/index/index | 首页 | 2列网格功能卡片入口 |
| pages/scan/scan | 扫码 | 扫描条形码/二维码 |
| pages/generate/generate | 生成 | 生成条形码/二维码 + Canvas导出 |
| pages/horoscope/horoscope | 星座运势 | 十二星座运势 + Canvas图片直存 |
| pages/watermark/watermark | 图片水印 | 添加/去除图片水印 |
| pages/game/game | 游戏中心 | 小游戏入口列表 |
| pages/cube/cube | 3D 魔方 | 拖动转层 + 7 步层先法教程 |

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

### 魔方模块 (`utils/cube*.js` + `pages/cube/`)
- **状态模型** `cube.js`：每个小方块 `{p:[x,y,z], c:[6]}`，`c` 按世界方向 `0:+x(R) 1:-x(L) 2:+y(U) 3:-y(D) 4:+z(F) 5:-z(B)` 存颜色；转动时颜色随方块搬移
- **面块索引**：`U 0..8 R 9..17 F 18..26 D 27..35 L 36..44 B 45..53`，`getFacelets()` 仅支持 3 阶
- **求解器** `cubeSolver.js`：层先法 7 阶段，`solveCube()` 返回 `{stages:[{id,name,tip,steps:[{alg,note}]}]}`；要求中心块为「黄上绿前」，否则返回 `error`
- **教程计划必须从第 0 步顺序执行**：已完成阶段 `steps` 为空，所以永远 `_showStep(0)` 起步，**不要按阶段跳转 / 跳过**；「上一步」用 `_rewindTo()` 对 `[to, 当前步)` 的公式倒序取逆
- **渲染** `cubeRender.js`：画家算法 + 背面剔除（`nv[2] < 0.02`），`highlight = {axis, layer, color}` 给当前要转的层描边
- **镜面魔方**：贴纸同色，`dim` 厚度 `[0.9,1.24,1.86]` 归一化，`isSolved()` 改判 `isShapeSolved()`（六面是否平齐）

### 云开发
- 环境ID在 `app.js` 的 `globalData.env` 中配置（当前为空，需开发者自行填写）
- 云函数目录: `cloudfunctions/quickstartFunctions/`

## 当前状态

- 7个页面全部注册：index、scan、generate、horoscope、watermark、game、cube
- `cloudTipModal` 组件保留但无页面引用（如后续不需要可删除）
- 首页使用 2列网格布局，新增功能卡片只需加一个 `<view class="card card-新颜色">` 块
