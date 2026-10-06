# cloudfunctions

> ⚠️ **本目录是 `miniprogram/cloudfunctions/` 的镜像，勿在此直接编辑。**

## 为什么有两份

微信开发者工具以 `suanming-preview/miniprogram/` 为**项目根**导入，
云函数必须位于项目根之下才能被工具识别（右键 → 上传并部署）。

因此**权威副本**是：

```
suanming-preview/miniprogram/cloudfunctions/insight/
├── index.js        云函数主逻辑
├── package.json    依赖声明（wx-server-sdk / @cloudbase/node-sdk）
└── config.json     权限配置
```

本目录（仓库根的 `cloudfunctions/`）仅为**架构契约留档**，
对应冻结契约「目录单向：`cloudfunctions → engine|insight → shared`」。

## 修改流程

1. 只改 `miniprogram/cloudfunctions/insight/` 下的文件
2. 改完把改动同步回本目录（保持两份一致）
3. 部署时右键的是 `miniprogram/cloudfunctions/insight`
