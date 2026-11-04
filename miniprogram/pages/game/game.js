// pages/game/game.js - 游戏中心
Page({
  data: {
    games: [
      {
        id: "cube",
        title: "3D 魔方",
        desc: "滑动转动 · 教程复原",
        emoji: "🧊",
        color: "card-pink",
        icon: "icon-cube",
        url: "/pages/cube/cube",
      },
    ],
    soon: [
      { title: "记忆翻牌", desc: "敬请期待", emoji: "🃏", color: "card-blue", icon: "icon-soon" },
      { title: "数字华容道", desc: "敬请期待", emoji: "🔢", color: "card-teal", icon: "icon-soon" },
      { title: "每日一猜", desc: "敬请期待", emoji: "🎲", color: "card-orange", icon: "icon-soon" },
      { title: "手指足球", desc: "敬请期待", emoji: "⚽", color: "card-purple", icon: "icon-soon" },
    ],
  },

  onLoad: function () {},

  onOpenGame: function (e) {
    var url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.navigateTo({
      url: url,
      fail: function (err) {
        console.error("跳转失败:", err);
        wx.showToast({ title: "跳转失败", icon: "none" });
      },
    });
  },

  onShareAppMessage: function () {
    return {
      title: "喵喵游戏中心 - 3D 魔方教程",
      path: "/pages/game/game",
    };
  },
});
