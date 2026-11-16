# Western Port · 实时浊度与预报

在地图上点选位置，查看 Tyabb Bank 连续站最新实测 FNU，以及由实测历史和天气/潮位预报推算的未来 168 小时 FNU 趋势。运行 `start-local.ps1` 启动本地服务并打开页面；仅双击 `index.html` 无法访问 IMOS 实测接口。

## 浊度数据与预报模型

页面现在接入 [IMOS Estuarine and Coastal Moorings](https://thredds.aodn.org.au/thredds/catalog/IMOS/ESTUARINE-COASTAL-MOORINGS/REALTIME/VIC-WESTERN-PORT/catalog.html) 的 `VIC-WESTERN-PORT` 站。传感器位于约 38.2657°S、145.2745°E，标称深度 0.7 m，近实时数据约每 15 分钟更新。观测变量单位为 FNU，页面显示最近有效读数和 UTC/墨尔本时间。FNU 是现场光学浊度单位，不应直接当作 NTU、TSS 或 SSC；IMOS 变量元数据给出的传感器读数精度为 0–999 FNU 范围内 ±3%。

### 数值估算

前一版三档加权风险逻辑已移除。新逻辑用 Tyabb Bank 近 19 天的小时中位浊度作为响应量，配对 Open-Meteo 同期风速/降雨和 Stony Point 潮位，前 96 小时不参与拟合。按时间先后切分训练段与留出段，用一小时持续性预报作基准；页面显示留出时段的一步误差比较。训练所得自回归关系逐小时递推到未来 7 天，并使用地图所选点的天气预报与 BOM 天文潮位。

关系式的输入包括上一小时 FNU、超出弱风门槛的风应力代理、涨/落潮速率、六小时降雨和风潮交互项。形式为 `FNU[t] = β0 + β1·FNU[t−1] + β2·wind_stress + β3·ebb + β4·flood + β5·rain_6h + β6·wind_ebb`。系数根据上述传感器数据重新拟合，而不是手工设定三档权重。

这是从报告支持的“潮流和风浪使底泥再悬浮、颗粒输运/沉降改变水柱浓度”机制出发的**单站实验模型**，不是 ELCOM/CAEDYM/SWAN 水动力泥沙模型，也未预测物理 NTU/TSS。当前连续观测仅来自 Tyabb Bank 一站；地图点离站越远，数值越是空间外推。未来涌浪和入口传播尚未纳入回归，因为没有同时间同位置的入口波流与浊度数据可校准该贡献；“影响因素”中仍可查看外海涌浪。若模型没有足够实测历史，页面会停止给出数值估算。

## 使用

- 在仓库目录运行 `start-local.ps1`；它启动仅监听本机回环地址的 Node 服务，通过服务器读取 IMOS 数据，并在浏览器打开 `http://127.0.0.1:8768/`。关闭后台 Node 进程会停止实时站点读取。
- 点击地图即可选点，也可以拖动、缩放，或用键盘移动后按「选择地图中心」。初次打开从 Hastings 附近开始，之后记住上次选点。底图不用于判断航道或水深。
- 日期卡片显示从对应时刻开始 24 小时内的最高 FNU 估算。切换七天或 24 小时视图，点图表或拖动滑块读取所选小时估算。展开“影响因素”可查看风、外海涌浪、潮位、降雨及各自图表。时间使用 `Australia/Melbourne`；CSV 同时保留 UTC 和 FNU 数值。
- 点选后按坐标请求最近的天气模型网格；两个点落在同一网格上时可能得到相同天气。外海涌浪和 Stony Point 潮位对所有选点共用。

## 数据和归属

| 输入 | 来源与限制 |
| --- | --- |
| 地图 | [Vicmap Index – Framework Polygon](https://discover.data.vic.gov.au/dataset/vicmap-index-framework-polygon)，© State of Victoria, Department of Transport and Planning，CC BY 4.0。裁剪 WFS 的 mainland、island coastal 并简化用于点选，不反映潮水淹没范围。地图控件使用 [Leaflet 1.9.4](https://leafletjs.com/reference-1.9.4.html)，许可见 `vendor/leaflet-LICENSE.txt`。 |
| 实测浊度 | [IMOS Western Port near-real-time mooring](https://thredds.aodn.org.au/thredds/catalog/IMOS/ESTUARINE-COASTAL-MOORINGS/REALTIME/VIC-WESTERN-PORT/catalog.html)，`VIC-WESTERN-PORT`，`TURB`，FNU。页面服务代理访问 [IMOS Live/AODN API](https://imoslive.aodn.org.au/)；感测站位置固定，与地图点位不完全重合。 |
| 风与降雨 | [Open-Meteo Forecast API](https://open-meteo.com/en/docs)。10 m 风、来风方向和逐小时降雨是模型资料。点位雨量不能代替流域径流或河流输沙。 |
| 拟合期历史天气 | [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api)，用于和 IMOS 实测序列配对拟合，不作为未来预报。 |
| 外海涌浪 | [Open-Meteo Marine](https://open-meteo.com/en/docs/marine-weather-api)，Météo-France MFWAM，使用 [Copernicus Marine Service 信息](https://doi.org/10.48670/moi-00017)。请求 38.6°S、145.0°E 的外海网格；显示有效波高、平均周期（非峰值周期）和来向。不代表 Flinders 海岸、两侧入口或湾内的实际波高。适用 [Open-Meteo 许可与条款](https://open-meteo.com/en/terms)。 |
| Stony Point 潮位 | [BOM Victorian Tide Tables](https://www.bom.gov.au/oceanography/projects/ntc/vic_tide_tables.shtml)，© Commonwealth of Australia as represented by the Bureau of Meteorology。使用 2026–2027 年高低潮预报，经本项目余弦插值，单位 m LAT。BOM 不为修改后的产品背书；参阅[完整使用条件和免责声明](https://www.bom.gov.au/oceanography/projects/ntc/Tidal_Information_Conditions_of_Use.pdf)。天文潮未考虑气象增水，不能当作本站实际水位、潮流或转流时刻。超出潮表范围留空。 |

IMOS 实测和历史天气由本地 Node 服务代理。天气、外海涌浪独立更新；失败时原始数据会带获取时间缓存。地图和潮表可离线读取。选点坐标保存在当前浏览器，并发送给 Open-Meteo 查询天气；本地服务只请求公开的 IMOS 与 Open-Meteo 数据。

## 调研结论与模型边界

- **外海涌浪是西入口的重要候选因素。** 高度、周期、来向和水深共同影响扰底。入口变浑不意味着整个湾都会变浑；涨潮既可能输送颗粒，也可能带来更清的水。要验证内湾影响，先比较入口与目标点的同期流向、浊度及可解释时滞。
- **内湾还受本地过程控制。** 浅滩风区、实际水深、潮流和可动底泥影响再悬浮。槽滩交换、河口径流与岸蚀、沉降与絮凝影响峰值及恢复。藻类、碎屑和有色溶解物也会影响水的外观。
- **单站回归边界。** 一站约 19 天的逐小时拟合只为数值预报提供一个实测锚点。留出段的一小时误差比较不能证明七天、多站点或不同季节的准确度；所选地图点越远，跨站误差越未知。BOM 潮位速率不是实测流速；传感器 FNU 也不是 NTU。
- **下一步验证。** 获取同地点同深度的高频浊度及波流资料，按完整、独立的风暴、洪水和大小潮事件留出验证，检查增加涌浪、入口输运和河流负荷后是否更准。

16 类机制、当地证据等级、各地验证重点和旧模型审计见[完整调研报告（2026-11-04）](research-cross-check-2026-11-04.md)。报告中的“当前网页”指改成地图前的版本。

## 文件

- `index.html`、`style.css`、`app.js`：页面和逐小时模型。
- `server.mjs`、`start-local.ps1`：本机静态服务与 IMOS 数据代理。仅监听 `127.0.0.1`。
- `data.js`：本地底图、Stony Point 高低潮（UTC Unix 秒、m LAT）和短期离线回退的初始预报快照；实时预报由浏览器请求。跨出潮表年份前需更新潮位资料。
- `vendor/`：Leaflet 运行文件与许可。无在线地图瓦片依赖。
