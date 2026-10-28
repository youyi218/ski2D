# 雪场手记

在像素雪山里，提前认识真实雪道：Saint-Lary-Soulan（比利牛斯）和 Isola 2000（尼斯附近，Alpes-Maritimes）。菜单顶部切换雪场，或直接打开 `?resort=isola`。在线游玩：<https://ski.youyi.name>

非官方、非实时，仅供熟悉地形。

## 开发

```bash
npm install
npm run dev     # 本地预览
npm test
npm run build   # 输出到 dist/
```

推送到 `main` 后，GitHub Actions 会自动构建并发布到 GitHub Pages。

数据重建脚本在 `scripts/build_resort.py`（`--resort isola` 重建 Isola 2000，数据在 `data/isola/`），来源与处理规则见 [docs/data-sources.md](docs/data-sources.md)。

## 许可

- 地图数据（`data/resort.json`、`data/scenery.json`、`data/raw/`、`data/isola/`）：© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)，按 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) 授权。
- 地形：Mapzen Terrain Tiles（EU-DEM / Copernicus，SRTM 与 GMTED2010 / USGS）。
