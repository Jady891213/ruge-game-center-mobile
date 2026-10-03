# 第三方许可说明

## 汉字笔顺数据：Hanzi Writer Data / Make Me A Hanzi

本项目的 `app/assets/hanzi-typing/index.html` 内嵌汉字字形路径和笔顺中线，用于离线展示笔画动画。数据来自 [chanind/hanzi-writer-data](https://github.com/chanind/hanzi-writer-data)，上游字形与笔顺来源为 [Make Me A Hanzi](https://github.com/skishore/makemeahanzi)。字形基于文鼎科技（Arphic Technology）的字体作品。

该字形数据使用 **Arphic Public License**。Hanzi Writer 程序与其字形数据的许可分别管理；本项目原页面将数据标为 MIT 的注释已更正。授权全文保存在 [LICENSES/Arphic-Public-License.txt](LICENSES/Arphic-Public-License.txt)，文件直接取自上游 [ARPHICPL.TXT](https://github.com/chanind/hanzi-writer-data/blob/master/ARPHICPL.TXT)。

本项目保留原有离线字形数据，补充缺失练习字“你”的七笔数据，来源为上游 [data/你.json](https://github.com/chanind/hanzi-writer-data/blob/master/data/%E4%BD%A0.json)。页面将上游 `strokes` / `medians` 字段整理为 `s` / `m` 字段，由本地 SVG 绘制逻辑展示，并按字的笔画数调整播放间隔。
