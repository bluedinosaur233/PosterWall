# 图源指引

网页入口在「素材 → 找封面」。先在来源网站找到作品与正确版本，保存 JPG、PNG 或 WebP，再导入 PosterWall。以下是查找入口，不是统一的图片下载接口；有的提供下载，有的仅展示商品封面或缩略图。

整理日期：2026-10-20。站点链接和用途依据官方页面、文档及检索结果整理；未逐一测试下载。访问、登录要求与可用尺寸以来源网站为准。

## 音乐

| 来源 | 适合找什么 | 怎么找 |
| --- | --- | --- |
| [CoverCay](https://cover.caydock.com/zh) | 歌曲、专辑、音乐视频封面 | 搜标题或歌手，选择对应地区与尺寸；找不到时尝试原名或其他发行地区。使用 iTunes Store 数据。 |
| [MusicBrainz](https://musicbrainz.org/) / [Cover Art Archive](https://musicbrainz.org/doc/Cover_Art_Archive) | 不同地区、年份、实体发行版的封面 | 打开具体发行版（release）的 Cover Art，选择标为 Front 的正封面，避免误用封底或内页。 |
| [Bandcamp](https://bandcamp.com/) | 独立音乐、原声、同人专辑 | 找艺人或厂牌的发行页，查看该张专辑封面；核对正式专辑、单曲、重制版。 |

## 影视

| 来源 | 适合找什么 | 怎么找 |
| --- | --- | --- |
| [TMDB](https://www.themoviedb.org/) | 电影、电视剧、番剧、季度海报 | 搜片名与年份，在作品的图片／海报（Images / Posters）页选语言；剧集总海报与季度海报可能不同。 |
| [Fanart.tv](https://fanart.tv/) | 影视海报、背景、无字图；也有音乐图 | 搜作品后选对应图片类型。做拼贴优先选 poster，做底座可找 background；logo 不等于完整海报。 |

## 动画

| 来源 | 适合找什么 | 怎么找 |
| --- | --- | --- |
| [Bangumi 番组计划](https://bgm.tv/) | 动画主视觉，也有书籍、音乐、游戏 | 用中文名或原名定位条目，核对 TV、OVA、剧场版和季度。适合先确认作品，清晰度不够时转作品官网或 TMDB。 |
| [AniList](https://anilist.co/search/anime) | 动画封面，英文／罗马音检索 | 进入具体作品页查看封面，区分续作、特别篇和剧场版。也可切换 Manga 查漫画条目。 |

需要某次放送的主视觉时，可以再找动画官网的 Key Visual / キービジュアル。书籍封面与动画主视觉往往不同。

## 游戏

| 来源 | 适合找什么 | 怎么找 |
| --- | --- | --- |
| [SteamGridDB](https://www.steamgriddb.com/) | PC、主机、非 Steam 游戏的封面和社区设计 | 搜游戏 → Grids，按尺寸、风格筛选。600 × 900 是常见竖版；也有方形。Heroes 是横幅，Logos 是标志。社区替代设计不一定是官方封面。 |
| [IGDB](https://www.igdb.com/) | 跨平台游戏、旧作的封面与插画 | 找具体游戏条目，核对平台、地区与重制版。封面和截图用途不同；条目图可用尺寸不一。 |

### Steam 本地封面

先找到 **Steam 客户端主目录**，通常不是游戏文件所在的 `steamapps/common`：

| 系统 | 常见位置 |
| --- | --- |
| Windows | `C:\Program Files (x86)\Steam` |
| macOS | `~/Library/Application Support/Steam` |
| Linux / Steam Deck | `~/.local/share/Steam`（有些安装也可通过 `~/.steam/steam` 访问） |

- 默认封面缓存：主目录下的 `appcache/librarycache`。包括子文件夹一起查找 `library_600x900`，通常可找到竖版封面；`library_hero` 通常是横幅。实际尺寸以图片文件为准。
- 自己设置的封面：主目录下的 `userdata/<用户编号>/config/grid`。只设置过自定义图片时才可能有相应文件；多账号需选对应编号。
- 缓存只包含客户端已经加载过的图片，不保证涵盖所有游戏。不同客户端版本可能按 App ID 建子目录，或使用不同文件名。
- 自定义安装、Flatpak 和其他打包方式可能使用不同根目录。只复制需要的图片，不移动或改写缓存；找不到时可用 SteamGridDB。

路径参考：[SteamGridDB 的缓存位置讨论](https://github.com/SteamGridDB/decky-steamgriddb/issues/131)、[自定义图片文件位置](https://github.com/SteamGridDB/SGDBoop/issues/7)、[Steam 官方 userdata 路径说明](https://help.steampowered.com/en/faqs/view/68D2-35AB-09A9-7678)。这些路径是客户端实现细节，不是稳定接口。

## 轻小说 / 漫画

| 来源 | 适合找什么 | 怎么找 |
| --- | --- | --- |
| [BOOK☆WALKER 日本](https://bookwalker.jp/) | 日文原版轻小说、漫画、画集 | 用日文书名＋卷数找单册商品页，避免把套装、合订本或活动横幅当作单册封面。 |
| [BOOK☆WALKER 台湾](https://www.bookwalker.com.tw/) | 繁中版轻小说、漫画 | 用繁中译名检索，核对卷数、出版社与特装版。 |
| [KADOKAWA](https://www.kadokawa.co.jp/) | 角川官方书目，电击文库、MF 文库 J 等 | 按原名、作者或文库品牌定位书目，查看对应单册。 |
| [集英社](https://www.shueisha.co.jp/books/) | 漫画单行本、小说、杂志 | 按书名或作者搜官方书目，核对卷数与纸书／电子版。 |

优先明确「日文原版／繁中版／简中版」及卷数；同一本书可能有普通版、特装版、新装版封面。找不到时，用出版社名称＋书名＋卷数检索官方商品页；例如同系列不同卷不要仅靠标题匹配。

## 书籍

| 来源 | 适合找什么 | 怎么找 |
| --- | --- | --- |
| [豆瓣读书](https://book.douban.com/) | 中文书籍、译本与版本信息 | 搜书名或 ISBN，核对出版社、出版年、装帧；图太小时用这些信息转到出版社书目页。 |
| [博客来](https://www.books.com.tw/) | 繁中书籍、轻小说、漫画、杂志 | 查看单本商品页的封面和 ISBN，避免把书腰、套书展示或赠品图误认成正封面。 |
| [Open Library](https://openlibrary.org/) | 外文书、不同版本封面 | 用书名或 ISBN 找具体 edition；部分版本没有封面。 |
| [Google Books](https://books.google.com/) | 多语言书籍及版本补充 | 搜书名、作者或 ISBN，确认版本。部分条目只有缩略图，不能保证有适合大幅输出的封面。 |

Open Library 也支持按 ISBN 定位封面，详见 [官方 Covers API](https://openlibrary.org/dev/docs/api/covers)。例如把下面的 `ISBN` 替换为具体书号（去掉连接符）：

```text
https://covers.openlibrary.org/b/isbn/ISBN-L.jpg?default=false
```

`L` 表示大图，不代表固定分辨率；`default=false` 会在缺图时返回 404，避免把空白占位图当作素材。遵守该站请求限制，不用它批量爬取书库。图片需先保存到本地，再导入 PosterWall。

## 选图与保存

1. 先核对作品与版本：原名、年份、季度、卷数、平台或 ISBN 比单独搜中文名更准确。
2. 进入来源作品页，优先选原图／大图，不要保存搜索结果页的缩略图。电脑可使用网站下载入口或图片右键保存，手机可长按；具体操作取决于站点。
3. 尽量统一同一类别的版式，例如电影竖版、专辑方形。PosterWall 会保留原图比例；需要更多层次时再混用不同尺寸。
4. 检查实际像素与清晰度。把小图改成大尺寸文件不会增加细节；找不到合适图片时换来源，或用自己拍摄／扫描的实体封面。
5. 保存 JPG、PNG、WebP。若下载得到 HTML、AVIF 或动态格式，先确认是真正的图片，再在本机转换成支持的格式。

封面版权归原权利人；能查看或下载不等于获得再授权。保留来源页，分享时注明来源；商业使用另行核对许可。

## 给 Agent

本页用于帮助用户选图与定位来源，不改变仓库的本地素材工作流。只有网站链接时，可提供候选来源页并说明版本；不要把网站 URL 写进项目的 `images[].src`，也不要自动增加抓取器、远程图片代理或 API Key。

使用用户提供或授权的本地图片生成。可在图片目录旁保存一份来源清单（作品名、年份／卷数／ISBN、来源页 URL、原文件名），不要把它作为图片导入。`title` 使用作品名；项目仍采用 [项目格式](./project-format.md) 中的字段。

网页指引位于 `index.html` 的 `#cover-dialog`。新增或替换来源时同步更新本页，保持网站链接、适用类别和简短用法一致。
