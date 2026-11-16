# Western Port · 七天水况

在 Western Port 地图上点选位置，查看未来 168 小时的风、降雨、外海涌浪和参考潮位。下载仓库后双击 `index.html` 即可打开，无需构建或 API 密钥。这个页面是环境预报，**没有经过验证的 NTU 浊度或能见度预报**。

## 使用

- 点击地图即可选点，也可以拖动、缩放，或用键盘移动后按「选择地图中心」。初次打开从 Hastings 附近开始，之后记住上次选点。底图不用于判断航道或水深。
- 日期卡片从所标时刻起算连续 24 小时，显示最高风速和最高外海涌浪。切换七天或 24 小时视图，点图表或拖动滑块读取同一小时的风向、浪高、周期、来向、潮位和降雨。时间使用 `Australia/Melbourne`；CSV 同时保留 UTC。
- 点选后按坐标请求最近的天气模型网格；两个点落在同一网格上时可能得到相同天气。外海涌浪和 Stony Point 潮位对所有选点共用。

## 数据和归属

| 输入 | 来源与限制 |
| --- | --- |
| 地图 | [Vicmap Index – Framework Polygon](https://discover.data.vic.gov.au/dataset/vicmap-index-framework-polygon)，© State of Victoria, Department of Transport and Planning，CC BY 4.0。裁剪 WFS 的 mainland、island coastal 并简化用于点选，不反映潮水淹没范围。地图控件使用 [Leaflet 1.9.4](https://leafletjs.com/reference-1.9.4.html)，许可见 `vendor/leaflet-LICENSE.txt`。 |
| 风与降雨 | [Open-Meteo Forecast API](https://open-meteo.com/en/docs)。10 m 风、来风方向和逐小时降雨是模型资料。点位雨量不能代替流域径流或河流输沙。 |
| 外海涌浪 | [Open-Meteo Marine](https://open-meteo.com/en/docs/marine-weather-api)，Météo-France MFWAM，使用 [Copernicus Marine Service 信息](https://doi.org/10.48670/moi-00017)。请求 38.6°S、145.0°E 的外海网格；显示有效波高、平均周期（非峰值周期）和来向。不代表 Flinders 海岸、两侧入口或湾内的实际波高。适用 [Open-Meteo 许可与条款](https://open-meteo.com/en/terms)。 |
| Stony Point 潮位 | [BOM Victorian Tide Tables](https://www.bom.gov.au/oceanography/projects/ntc/vic_tide_tables.shtml)，© Commonwealth of Australia as represented by the Bureau of Meteorology。使用 2026–2027 年高低潮预报，经本项目余弦插值，单位 m LAT。BOM 不为修改后的产品背书；参阅[完整使用条件和免责声明](https://www.bom.gov.au/oceanography/projects/ntc/Tidal_Information_Conditions_of_Use.pdf)。天文潮未考虑气象增水，不能当作本站实际水位、潮流或转流时刻。超出潮表范围留空。 |

天气和外海涌浪独立更新。失败时仅保留仍覆盖未来时段、带原获取时间的缓存；缺测和过期时刻留空。地图和潮表可离线读取。坐标保存在当前浏览器，并发送给 Open-Meteo 查询天气；没有项目账户、位置权限或项目服务器。

## 调研结论与模型边界

- **外海涌浪是西入口的重要候选因素。** 高度、周期、来向和水深共同影响扰底。入口变浑不意味着整个湾都会变浑；涨潮既可能输送颗粒，也可能带来更清的水。要验证内湾影响，先比较入口与目标点的同期流向、浊度及可解释时滞。
- **内湾还受本地过程控制。** 浅滩风区、实际水深、潮流和可动底泥影响再悬浮。槽滩交换、河口径流与岸蚀、沉降与絮凝影响峰值及恢复。藻类、碎屑和有色溶解物也会影响水的外观。
- **旧情景指数未校准。** 同一潮位变化率不能代替各地点潮流；统一沉降和换水公式不能外推到任意地图点位。EPA 月度历史表层样本不能替代新选点的实时浊度或验证小时峰值。
- **下一步验证。** 获取同地点同深度的高频浊度及波流资料，按完整、独立的风暴、洪水和大小潮事件留出验证，检查增加涌浪、入口输运和河流负荷后是否更准。

16 类机制、当地证据等级、各地验证重点和旧模型审计见[完整调研报告（2026-11-04）](research-cross-check-2026-11-04.md)。报告中的“当前网页”指改成地图前的版本。

## 文件

- `index.html`、`style.css`、`app.js`：静态站点。
- `data.js`：本地底图、Stony Point 高低潮（UTC Unix 秒、m LAT）和短期离线回退的初始预报快照；实时预报由浏览器请求。跨出潮表年份前需更新潮位资料。
- `vendor/`：Leaflet 运行文件与许可。无在线地图瓦片依赖。
