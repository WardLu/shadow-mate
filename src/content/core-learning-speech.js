import { LITERACY_SPEECH_ENTRIES } from "./literacy-speech.js";

export const POEMS = Object.freeze([
  {g:"一年级上",t:"咏鹅",a:"骆宾王",c:["鹅，鹅，鹅，","曲项向天歌。","白毛浮绿水，","红掌拨清波。"]},
  {g:"一年级上",t:"静夜思",a:"李白",c:["床前明月光，","疑是地上霜。","举头望明月，","低头思故乡。"]},
  {g:"一年级上",t:"悯农（其二）",a:"李绅",c:["锄禾日当午，","汗滴禾下土。","谁知盘中餐，","粒粒皆辛苦。"]},
  {g:"一年级上",t:"画",a:"王维",c:["远看山有色，","近听水无声。","春去花还在，","人来鸟不惊。"]},
  {g:"一年级上",t:"风",a:"李峤",c:["解落三秋叶，","能开二月花。","过江千尺浪，","入竹万竿斜。"]},
  {g:"一年级上",t:"古朗月行（节选）",a:"李白",c:["小时不识月，","呼作白玉盘。","又疑瑶台镜，","飞在青云端。"]},
  {g:"一年级下",t:"春晓",a:"孟浩然",c:["春眠不觉晓，","处处闻啼鸟。","夜来风雨声，","花落知多少。"]},
  {g:"一年级下",t:"村居",a:"高鼎",c:["草长莺飞二月天，","拂堤杨柳醉春烟。","儿童散学归来早，","忙趁东风放纸鸢。"]},
  {g:"一年级下",t:"所见",a:"袁枚",c:["牧童骑黄牛，","歌声振林樾。","意欲捕鸣蝉，","忽然闭口立。"]},
  {g:"一年级下",t:"小池",a:"杨万里",c:["泉眼无声惜细流，","树阴照水爱晴柔。","小荷才露尖尖角，","早有蜻蜓立上头。"]},
  {g:"二年级上",t:"登鹳雀楼",a:"王之涣",c:["白日依山尽，","黄河入海流。","欲穷千里目，","更上一层楼。"]},
  {g:"二年级上",t:"望庐山瀑布",a:"李白",c:["日照香炉生紫烟，","遥看瀑布挂前川。","飞流直下三千尺，","疑是银河落九天。"]},
  {g:"二年级上",t:"夜宿山寺",a:"李白",c:["危楼高百尺，","手可摘星辰。","不敢高声语，","恐惊天上人。"]},
  {g:"二年级上",t:"敕勒歌",a:"北朝民歌",c:["敕勒川，阴山下，","天似穹庐，笼盖四野。","天苍苍，野茫茫，","风吹草低见牛羊。"]},
  {g:"二年级下",t:"赋得古原草送别（节选）",a:"白居易",c:["离离原上草，","一岁一枯荣。","野火烧不尽，","春风吹又生。"]},
  {g:"三年级上",t:"山行",a:"杜牧",c:["远上寒山石径斜，","白云生处有人家。","停车坐爱枫林晚，","霜叶红于二月花。"]},
  {id:"poem-jiangnan",g:"一年级上",t:"江南",a:"汉乐府",c:["江南可采莲，","莲叶何田田。","鱼戏莲叶间。","鱼戏莲叶东，","鱼戏莲叶西，","鱼戏莲叶南，","鱼戏莲叶北。"],theme:"荷塘与方位",agePackages:["foundation-v2","bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"听一听诗里说了哪些方向，找找鱼儿在哪里玩。"},
  {id:"poem-yongliu",g:"二年级下",t:"咏柳",a:"贺知章",c:["碧玉妆成一树高，","万条垂下绿丝绦。","不知细叶谁裁出，","二月春风似剪刀。"],theme:"春天与植物",agePackages:["foundation-v2","bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"看看诗里把春风想成了什么。"},
  {id:"poem-huixiang-ou-shu",g:"二年级上",t:"回乡偶书",a:"贺知章",c:["少小离家老大回，","乡音无改鬓毛衰。","儿童相见不相识，","笑问客从何处来。"],theme:"回家与成长",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"听一听诗人回乡时遇到的小朋友说了什么。"},
  {id:"poem-liangzhou-ci-wang-zhihuan",g:"二年级上",t:"凉州词",a:"王之涣",c:["黄河远上白云间，","一片孤城万仞山。","羌笛何须怨杨柳，","春风不度玉门关。"],theme:"边塞与远方",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"想象远处的黄河和高山是什么样子。"},
  {id:"poem-zeng-wanglun",g:"一年级下",t:"赠汪伦",a:"李白",c:["李白乘舟将欲行，","忽闻岸上踏歌声。","桃花潭水深千尺，","不及汪伦送我情。"],theme:"朋友与告别",agePackages:["foundation-v2","bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"听听朋友怎样送别李白。"},
  {id:"poem-luchai",g:"四年级上",t:"鹿柴",a:"王维",c:["空山不见人，","但闻人语响。","返景入深林，","复照青苔上。"],theme:"山林与声音",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"闭上眼听一听，诗里先听见了什么声音？"},
  {id:"poem-song-yuan-er",g:"二年级下",t:"送元二使安西",a:"王维",c:["渭城朝雨浥轻尘，","客舍青青柳色新。","劝君更尽一杯酒，","西出阳关无故人。"],theme:"送别与友情",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"说说清晨下过雨后，诗里看到了什么。"},
  {id:"poem-jiuyue-jiu-ri",g:"三年级上",t:"九月九日忆山东兄弟",a:"王维",c:["独在异乡为异客，","每逢佳节倍思亲。","遥知兄弟登高处，","遍插茱萸少一人。"],theme:"节日与亲人",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"诗人过节时想起了谁？"},
  {id:"poem-huanghe-lou-song-meng",g:"三年级上",t:"黄鹤楼送孟浩然之广陵",a:"李白",c:["故人西辞黄鹤楼，","烟花三月下扬州。","孤帆远影碧空尽，","唯见长江天际流。"],theme:"朋友与远行",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",sourceNote:"整理PDF将扬州抄作扬洲；扬州据维基文库核对，碧空采用PDF版本。",additionalSourceUrl:"https://zh.wikisource.org/wiki/黃鶴樓送孟浩然之廣陵",prompt:"看看朋友的小船最后消失在哪里。"},
  {id:"poem-wangtianmen-shan",g:"三年级上",t:"望天门山",a:"李白",c:["天门中断楚江开，","碧水东流至此回。","两岸青山相对出，","孤帆一片日边来。"],theme:"山水与行船",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"找找诗里有哪些山、水和船。"},
  {id:"poem-biedongda",g:"三年级上",t:"别董大",a:"高适",c:["千里黄云白日曛，","北风吹雁雪纷纷。","莫愁前路无知己，","天下谁人不识君。"],theme:"朋友与鼓励",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"诗人怎样鼓励即将远行的朋友？"},
  {id:"poem-jueju-two-oriole",g:"二年级下",t:"绝句",a:"杜甫",c:["两个黄鹂鸣翠柳，","一行白鹭上青天。","窗含西岭千秋雪，","门泊东吴万里船。"],theme:"春景与颜色",agePackages:["foundation-v2","bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"一起找一找诗里的颜色和动物。"},
  {id:"poem-jiangpan-duxing",g:"三年级上",t:"江畔独步寻花（其五）",a:"杜甫",c:["黄师塔前江水东，","春光懒困倚微风。","桃花一簇开无主，","可爱深红爱浅红？"],theme:"春花与颜色",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"看看诗里的桃花有哪些颜色。"},
  {id:"poem-fengqiao-ye-bo",g:"三年级上",t:"枫桥夜泊",a:"张继",c:["月落乌啼霜满天，","江枫渔火对愁眠。","姑苏城外寒山寺，","夜半钟声到客船。"],theme:"夜晚与声音",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"想象夜里传来的钟声有多远。"},
  {id:"poem-chuzhou-xijian",g:"三年级下",t:"滁州西涧",a:"韦应物",c:["独怜幽草涧边生，","上有黄鹂深树鸣。","春潮带雨晚来急，","野渡无人舟自横。"],theme:"溪边与春雨",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"看看溪边的小草和小船分别在哪里。"},
  {id:"poem-youzi-yin",g:"四年级下",t:"游子吟",a:"孟郊",c:["慈母手中线，","游子身上衣。","临行密密缝，","意恐迟迟归。","谁言寸草心，","报得三春晖。"],theme:"家人与关爱",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"诗里的衣服是谁做的？可以说说家人怎样照顾你。"},
  {id:"poem-zaochun-cheng-shiba",g:"四年级下",t:"早春呈水部张十八员外",a:"韩愈",c:["天街小雨润如酥，","草色遥看近却无。","最是一年春好处，","绝胜烟柳满皇都。"],theme:"春雨与新绿",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"远看和走近看，春草有什么不同？"},
  {id:"poem-yugezi",g:"三年级下",t:"渔歌子",a:"张志和",c:["西塞山前白鹭飞，","桃花流水鳜鱼肥。","青箬笠，绿蓑衣，","斜风细雨不须归。"],theme:"水乡与春雨",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"找一找诗人看到了哪些颜色。"},
  {id:"poem-wangdongting",g:"三年级上",t:"望洞庭",a:"刘禹锡",c:["湖光秋月两相和，","潭面无风镜未磨。","遥望洞庭山水色，","白银盘里一青螺。"],theme:"湖水与比喻",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"诗人把湖和山比作了什么？"},
  {id:"poem-langtaosha",g:"三年级下",t:"浪淘沙（其一）",a:"刘禹锡",c:["九曲黄河万里沙，","浪淘风簸自天涯。","如今直上银河去，","同到牵牛织女家。"],theme:"黄河与想象",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"想象黄河水一路流到了哪里。"},
  {id:"poem-yi-jiangnan",g:"三年级下",t:"忆江南",a:"白居易",c:["江南好，","风景旧曾谙。","日出江花红胜火，","春来江水绿如蓝。","能不忆江南？"],theme:"江南与颜色",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"说出诗里两种鲜明的颜色。"},
  {id:"poem-jiangxue",g:"二年级上",t:"江雪",a:"柳宗元",c:["千山鸟飞绝，","万径人踪灭。","孤舟蓑笠翁，","独钓寒江雪。"],theme:"冬天与观察",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"想象雪中的江面，找找画面里的人和船。"},
  {id:"poem-xun-yin-zhe",g:"一年级下",t:"寻隐者不遇",a:"贾岛",c:["松下问童子，","言师采药去。","只在此山中，","云深不知处。"],theme:"山林与问答",agePackages:["foundation-v2","bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"听听童子告诉了访客什么。"},
  {id:"poem-qingming",g:"三年级下",t:"清明",a:"杜牧",c:["清明时节雨纷纷，","路上行人欲断魂。","借问酒家何处有？","牧童遥指杏花村。"],theme:"春雨与问路",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"看看行人向谁问路，牧童怎样回答。"},
  {id:"poem-jiangnan-chun",g:"三年级下",t:"江南春",a:"杜牧",c:["千里莺啼绿映红，","水村山郭酒旗风。","南朝四百八十寺，","多少楼台烟雨中。"],theme:"春景与远望",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"找一找春天的颜色和声音。"},
  {id:"poem-feng-luo-yin",g:"三年级下",t:"蜂",a:"罗隐",c:["不论平地与山尖，","无限风光尽被占。","采得百花成蜜后，","为谁辛苦为谁甜？"],theme:"昆虫与花朵",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"聊聊蜜蜂会去花丛里做什么。"},
  {id:"poem-jiangshang-yuzhe",g:"三年级下",t:"江上渔者",a:"范仲淹",c:["江上往来人，","但爱鲈鱼美。","君看一叶舟，","出没风波里。"],theme:"江面与生活",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"看看江上的人和小船有什么不同。"},
  {id:"poem-yuanri",g:"三年级下",t:"元日",a:"王安石",c:["爆竹声中一岁除，","春风送暖入屠苏。","千门万户曈曈日，","总把新桃换旧符。"],theme:"新年与习俗",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"说说诗里写了哪些迎接新年的景象。"},
  {id:"poem-bochuang-guazhou",g:"五年级下",t:"泊船瓜洲",a:"王安石",c:["京口瓜洲一水间，","钟山只隔数重山。","春风又绿江南岸，","明月何时照我还。"],theme:"春风与思念",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"感受诗里春风带来的变化。"},
  {id:"poem-huichong-chunjiang",g:"三年级下",t:"惠崇春江晓景",a:"苏轼",c:["竹外桃花三两枝，","春江水暖鸭先知。","蒌蒿满地芦芽短，","正是河豚欲上时。"],theme:"春江与动物",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"鸭子先发现了什么季节变化？"},
  {id:"poem-tixi-linbi",g:"四年级上",t:"题西林壁",a:"苏轼",c:["横看成岭侧成峰，","远近高低各不同。","不识庐山真面目，","只缘身在此山中。"],theme:"山形与视角",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"换一个位置看同一座山，会看到什么不同？"},
  {id:"poem-san-qu-dao-zhong",g:"三年级下",t:"三衢道中",a:"曾几",c:["梅子黄时日日晴，","小溪泛尽却山行。","绿阴不减来时路，","添得黄鹂四五声。"],theme:"夏日与旅途",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"听一听旅途中新增了什么声音。"},
  {id:"poem-sishi-tianyuan",g:"四年级下",t:"四时田园杂兴（其二十五）",a:"范成大",c:["梅子金黄杏子肥，","麦花雪白菜花稀。","日长篱落无人过，","惟有蜻蜓蛱蝶飞。"],theme:"田园与夏天",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"数数诗里出现了哪些植物和小动物。"},
  {id:"poem-xiaochu-jingci-si",g:"二年级下",t:"晓出净慈寺送林子方",a:"杨万里",c:["毕竟西湖六月中，","风光不与四时同。","接天莲叶无穷碧，","映日荷花别样红。"],theme:"夏天与荷花",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"找一找荷叶和荷花分别是什么颜色。"},
  {id:"poem-chunri-zhu-xi",g:"四年级下",t:"春日",a:"朱熹",c:["胜日寻芳泗水滨，","无边光景一时新。","等闲识得东风面，","万紫千红总是春。"],theme:"春天与颜色",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"春天的景物在诗里有哪些颜色？"},
  {id:"poem-guanshu-yougan",g:"四年级下",t:"观书有感（其一）",a:"朱熹",c:["半亩方塘一鉴开，","天光云影共徘徊。","问渠那得清如许？","为有源头活水来。"],theme:"读书与观察",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"看看池塘里映出了什么。"},
  {id:"poem-youyuan-buzhi",g:"四年级下",t:"游园不值",a:"叶绍翁",c:["应怜屐齿印苍苔，","小扣柴扉久不开。","春色满园关不住，","一枝红杏出墙来。"],theme:"春天与植物",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"猜猜园子里还有什么春天的景色。"},
  {id:"poem-xiangcun-siyue",g:"四年级下",t:"乡村四月",a:"翁卷",c:["绿遍山原白满川，","子规声里雨如烟。","乡村四月闲人少，","才了蚕桑又插田。"],theme:"乡村与春耕",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"听听乡村里的人们在忙什么。"},
  {id:"poem-momei",g:"五年级下",t:"墨梅",a:"王冕",c:["我家洗砚池头树，","朵朵花开淡墨痕。","不要人夸好颜色，","只留清气满乾坤。"],theme:"梅花与品格",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"看看诗里的梅花是什么颜色。"},
  {id:"poem-zhushi",g:"五年级下",t:"竹石",a:"郑燮",c:["咬定青山不放松，","立根原在破岩中。","千磨万击还坚劲，","任尔东西南北风。"],theme:"竹子与坚持",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"看看竹子在什么地方生长。"},
  {id:"poem-zaofa-baidi-cheng",g:"三年级上",t:"早发白帝城",a:"李白",c:["朝辞白帝彩云间，","千里江陵一日还。","两岸猿声啼不住，","轻舟已过万重山。"],theme:"远行与山水",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"听听小船一路上听见了什么。"},
  {id:"poem-chunye-xiyu",g:"三年级下",t:"春夜喜雨（节选）",a:"杜甫",c:["好雨知时节，","当春乃发生。","随风潜入夜，","润物细无声。"],theme:"春雨与植物",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"雨在夜里怎样帮助植物？"},
  {id:"poem-jueju-chi-ri",g:"三年级下",t:"绝句",a:"杜甫",c:["迟日江山丽，","春风花草香。","泥融飞燕子，","沙暖睡鸳鸯。"],theme:"春景与动物",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"找一找春天里正在活动的动物。"},
  {id:"poem-changle-ge",g:"五年级下",t:"长歌行（节选）",a:"汉乐府",c:["青青园中葵，","朝露待日晞。","阳春布德泽，","万物生光辉。"],theme:"植物与晨光",agePackages:["bridging-v1"],sourceRef:"hnwu-poetry-transcription",prompt:"听一听清晨的露水和阳光。"},
  {id:"poem-muyu",g:"三年级上",t:"暮江吟",a:"白居易",c:["一道残阳铺水中，","半江瑟瑟半江红。","可怜九月初三夜，","露似真珠月似弓。"],theme:"傍晚与颜色",agePackages:["bridging-v1"],sourceRef:"wikisource-mujiangyin",prompt:"说说诗里的江水和月亮像什么。"},
]);

export const ENGLISH = Object.freeze([
  ["apple","/ˈæp.əl/","苹果","水果"],["banana","/bəˈnɑː.nə/","香蕉","水果"],["orange","/ˈɒr.ɪndʒ/","橙子","水果"],
  ["red","/red/","红色","颜色"],["yellow","/ˈjel.əʊ/","黄色","颜色"],["blue","/bluː/","蓝色","颜色"],
  ["green","/ɡriːn/","绿色","颜色"],["cat","/kæt/","猫","动物"],["dog","/dɒɡ/","狗","动物"],["fish","/fɪʃ/","鱼","动物"],
  ["bird","/bɜːd/","鸟","动物"],["duck","/dʌk/","鸭子","动物"],["cow","/kaʊ/","奶牛","动物"],["pig","/pɪɡ/","猪","动物"],
  ["rabbit","/ˈræb.ɪt/","兔子","动物"],["tiger","/ˈtaɪ.ɡər/","老虎","动物"],["elephant","/ˈel.ɪ.fənt/","大象","动物"],
  ["monkey","/ˈmʌŋ.ki/","猴子","动物"],["mom","/mɒm/","妈妈","家人"],["dad","/dæd/","爸爸","家人"],
  ["brother","/ˈbrʌð.ər/","兄弟","家人"],["sister","/ˈsɪs.tər/","姐妹","家人"],["grandma","/ˈɡræn.mɑː/","奶奶","家人"],
  ["grandpa","/ˈɡræn.pɑː/","爷爷","家人"],["eye","/aɪ/","眼睛","身体"],["ear","/ɪər/","耳朵","身体"],
  ["nose","/nəʊz/","鼻子","身体"],["mouth","/maʊθ/","嘴巴","身体"],["hand","/hænd/","手","身体"],
  ["foot","/fʊt/","脚","身体"],["head","/hed/","头","身体"],["book","/bʊk/","书","学习"],
  ["pen","/pen/","钢笔","学习"],["bag","/bæɡ/","书包","学习"],["desk","/desk/","书桌","学习"],
  ["sun","/sʌn/","太阳","自然"],["moon","/muːn/","月亮","自然"],["star","/stɑːr/","星星","自然"],
  ["flower","/ˈflaʊ.ər/","花","自然"],["tree","/triː/","树","自然"],["water","/ˈwɔː.tər/","水","自然"],
  ["eat","/iːt/","吃","动作"],["drink","/drɪŋk/","喝","动作"],["run","/rʌn/","跑","动作"],
  ["jump","/dʒʌmp/","跳","动作"],["read","/riːd/","读","动作"],["write","/raɪt/","写","动作"],
  ["sing","/sɪŋ/","唱","动作"],["play","/pleɪ/","玩","动作"],["sleep","/sliːp/","睡觉","动作"],
  ["big","/bɪɡ/","大的","形容词"],["small","/smɔːl/","小的","形容词"],["hot","/hɒt/","热的","形容词"],
  ["cold","/kəʊld/","冷的","形容词"],["happy","/ˈhæp.i/","开心","形容词"],["one","/wʌn/","一","数字"],
  ["two","/tuː/","二","数字"],["three","/θriː/","三","数字"],["four","/fɔːr/","四","数字"],
  ["five","/faɪv/","五","数字"],["six","/sɪks/","六","数字"],["seven","/ˈsev.ən/","七","数字"],
  ["eight","/eɪt/","八","数字"],["nine","/naɪn/","九","数字"],["ten","/ten/","十","数字"],
  ["house","/haʊs/","房子","家","foundation-v2","original-vocabulary-curation"],["home","/həʊm/","家","家","foundation-v2","original-vocabulary-curation"],["room","/ruːm/","房间","家","foundation-v2","original-vocabulary-curation"],["door","/dɔːr/","门","家","foundation-v2","original-vocabulary-curation"],["window","/ˈwɪn.dəʊ/","窗户","家","foundation-v2","original-vocabulary-curation"],["bed","/bed/","床","家","foundation-v2","original-vocabulary-curation"],["chair","/tʃeər/","椅子","家","foundation-v2","original-vocabulary-curation"],["table","/ˈteɪ.bəl/","桌子","家","foundation-v2","original-vocabulary-curation"],["lamp","/læmp/","灯","家","foundation-v2","original-vocabulary-curation"],["box","/bɒks/","盒子","家","foundation-v2","original-vocabulary-curation"],
  ["shirt","/ʃɜːt/","衬衫","衣物","foundation-v2","original-vocabulary-curation"],["coat","/kəʊt/","外套","衣物","foundation-v2","original-vocabulary-curation"],["dress","/dres/","连衣裙","衣物","foundation-v2","original-vocabulary-curation"],["shoe","/ʃuː/","鞋","衣物","foundation-v2","original-vocabulary-curation"],["sock","/sɒk/","袜子","衣物","foundation-v2","original-vocabulary-curation"],["hat","/hæt/","帽子","衣物","foundation-v2","original-vocabulary-curation"],["cup","/kʌp/","杯子","餐桌","foundation-v2","original-vocabulary-curation"],["plate","/pleɪt/","盘子","餐桌","foundation-v2","original-vocabulary-curation"],["spoon","/spuːn/","勺子","餐桌","foundation-v2","original-vocabulary-curation"],
  ["bread","/bred/","面包","食物","foundation-v2","original-vocabulary-curation"],["rice","/raɪs/","米饭","食物","foundation-v2","original-vocabulary-curation"],["egg","/eɡ/","鸡蛋","食物","foundation-v2","original-vocabulary-curation"],["cheese","/tʃiːz/","奶酪","食物","foundation-v2","original-vocabulary-curation"],["cake","/keɪk/","蛋糕","食物","foundation-v2","original-vocabulary-curation"],["pear","/peər/","梨","食物","foundation-v2","original-vocabulary-curation"],["grape","/ɡreɪp/","葡萄","食物","foundation-v2","original-vocabulary-curation"],["lemon","/ˈlem.ən/","柠檬","食物","foundation-v2","original-vocabulary-curation"],["carrot","/ˈkær.ət/","胡萝卜","食物","foundation-v2","original-vocabulary-curation"],["tomato","/təˈmɑː.təʊ/","番茄","食物","foundation-v2","original-vocabulary-curation"],
  ["lion","/ˈlaɪ.ən/","狮子","动物","foundation-v2","original-vocabulary-curation"],["bear","/beər/","熊","动物","foundation-v2","original-vocabulary-curation"],["fox","/fɒks/","狐狸","动物","foundation-v2","original-vocabulary-curation"],["frog","/frɒɡ/","青蛙","动物","foundation-v2","original-vocabulary-curation"],["mouse","/maʊs/","老鼠","动物","foundation-v2","original-vocabulary-curation"],["sheep","/ʃiːp/","绵羊","动物","foundation-v2","original-vocabulary-curation"],["horse","/hɔːs/","马","动物","foundation-v2","original-vocabulary-curation"],["goat","/ɡəʊt/","山羊","动物","foundation-v2","original-vocabulary-curation"],["turtle","/ˈtɜː.təl/","乌龟","动物","foundation-v2","original-vocabulary-curation"],["bee","/biː/","蜜蜂","动物","foundation-v2","original-vocabulary-curation"],
  ["face","/feɪs/","脸","身体","foundation-v2","original-vocabulary-curation"],["hair","/heər/","头发","身体","foundation-v2","original-vocabulary-curation"],["arm","/ɑːm/","手臂","身体","foundation-v2","original-vocabulary-curation"],["leg","/leɡ/","腿","身体","foundation-v2","original-vocabulary-curation"],["knee","/niː/","膝盖","身体","foundation-v2","original-vocabulary-curation"],["toe","/təʊ/","脚趾","身体","foundation-v2","original-vocabulary-curation"],["tooth","/tuːθ/","牙齿","身体","foundation-v2","original-vocabulary-curation"],["teeth","/tiːθ/","牙齿（复数）","身体","foundation-v2","original-vocabulary-curation"],["finger","/ˈfɪŋ.ɡər/","手指","身体","foundation-v2","original-vocabulary-curation"],
  ["purple","/ˈpɜː.pəl/","紫色","颜色","foundation-v2","original-vocabulary-curation"],["pink","/pɪŋk/","粉色","颜色","foundation-v2","original-vocabulary-curation"],["golden","/ˈɡəʊl.dən/","金色","颜色","foundation-v2","original-vocabulary-curation"],["grey","/ɡreɪ/","灰色","颜色","foundation-v2","original-vocabulary-curation"],["circle","/ˈsɜː.kəl/","圆形","形状","foundation-v2","original-vocabulary-curation"],["square","/skweər/","正方形","形状","foundation-v2","original-vocabulary-curation"],["planet","/ˈplæn.ɪt/","行星","自然","foundation-v2","original-vocabulary-curation"],["heart","/hɑːt/","心形","形状","foundation-v2","original-vocabulary-curation"],
  ["open","/ˈəʊ.pən/","打开","动作","foundation-v2","original-vocabulary-curation"],["close","/kləʊz/","关上","动作","foundation-v2","original-vocabulary-curation"],["wash","/wɒʃ/","洗","动作","foundation-v2","original-vocabulary-curation"],["help","/help/","帮忙","动作","foundation-v2","original-vocabulary-curation"],["look","/lʊk/","看","动作","foundation-v2","original-vocabulary-curation"],["see","/siː/","看见","动作","foundation-v2","original-vocabulary-curation"],["talk","/tɔːk/","说话","动作","foundation-v2","original-vocabulary-curation"],["ask","/ɑːsk/","询问","动作","foundation-v2","original-vocabulary-curation"],["make","/meɪk/","制作","动作","foundation-v2","original-vocabulary-curation"],["draw","/drɔː/","画","动作","foundation-v2","original-vocabulary-curation"],
  ["walk","/wɔːk/","走路","动作","foundation-v2","original-vocabulary-curation"],["swim","/swɪm/","游泳","动作","foundation-v2","original-vocabulary-curation"],["dance","/dɑːns/","跳舞","动作","foundation-v2","original-vocabulary-curation"],["smile","/smaɪl/","微笑","动作","foundation-v2","original-vocabulary-curation"],["cry","/kraɪ/","哭","动作","foundation-v2","original-vocabulary-curation"],["cook","/kʊk/","做饭","动作","foundation-v2","original-vocabulary-curation"],["give","/ɡɪv/","给","动作","foundation-v2","original-vocabulary-curation"],["take","/teɪk/","拿","动作","foundation-v2","original-vocabulary-curation"],["find","/faɪnd/","找到","动作","foundation-v2","original-vocabulary-curation"],["wait","/weɪt/","等待","动作","foundation-v2","original-vocabulary-curation"],
  ["sad","/sæd/","难过","感受","foundation-v2","original-vocabulary-curation"],["kind","/kaɪnd/","友善","感受","foundation-v2","original-vocabulary-curation"],["funny","/ˈfʌn.i/","有趣","感受","foundation-v2","original-vocabulary-curation"],["clean","/kliːn/","干净","感受","foundation-v2","original-vocabulary-curation"],["dirty","/ˈdɜː.ti/","脏","感受","foundation-v2","original-vocabulary-curation"],["fast","/fɑːst/","快","感受","foundation-v2","original-vocabulary-curation"],["slow","/sləʊ/","慢","感受","foundation-v2","original-vocabulary-curation"],["tall","/tɔːl/","高","感受","foundation-v2","original-vocabulary-curation"],["short","/ʃɔːt/","矮；短","感受","foundation-v2","original-vocabulary-curation"],
  ["morning","/ˈmɔː.nɪŋ/","早晨","时间","foundation-v2","original-vocabulary-curation"],["evening","/ˈiːv.nɪŋ/","傍晚","时间","foundation-v2","original-vocabulary-curation"],["today","/təˈdeɪ/","今天","时间","foundation-v2","original-vocabulary-curation"],["tomorrow","/təˈmɒr.əʊ/","明天","时间","foundation-v2","original-vocabulary-curation"],["sunny","/ˈsʌn.i/","晴朗的","天气","foundation-v2","original-vocabulary-curation"],["rainy","/ˈreɪ.ni/","下雨的","天气","foundation-v2","original-vocabulary-curation"],["cloudy","/ˈklaʊ.di/","多云的","天气","foundation-v2","original-vocabulary-curation"],["windy","/ˈwɪn.di/","有风的","天气","foundation-v2","original-vocabulary-curation"],["snow","/snəʊ/","雪","自然","foundation-v2","original-vocabulary-curation"],["rain","/reɪn/","雨","自然","foundation-v2","original-vocabulary-curation"],
  ["outside","/ˌaʊtˈsaɪd/","外面","地方","bridging-v1","original-vocabulary-curation"],["inside","/ˌɪnˈsaɪd/","里面","地方","bridging-v1","original-vocabulary-curation"],["between","/bɪˈtwiːn/","在两者之间","方位","bridging-v1","original-vocabulary-curation"],["behind","/bɪˈhaɪnd/","在后面","方位","bridging-v1","original-vocabulary-curation"],["beside","/bɪˈsaɪd/","在旁边","方位","bridging-v1","original-vocabulary-curation"],["under","/ˈʌn.dər/","在下面","方位","bridging-v1","original-vocabulary-curation"],["above","/əˈbʌv/","在上方","方位","bridging-v1","original-vocabulary-curation"],["through","/θruː/","穿过","方位","bridging-v1","original-vocabulary-curation"],["across","/əˈkrɒs/","横过","方位","bridging-v1","original-vocabulary-curation"],
  ["because","/bɪˈkɒz/","因为","连接词","bridging-v1","original-vocabulary-curation"],["before","/bɪˈfɔːr/","以前；在……之前","时间","bridging-v1","original-vocabulary-curation"],["after","/ˈɑːf.tər/","以后；在……之后","时间","bridging-v1","original-vocabulary-curation"],["together","/təˈɡeð.ər/","一起","日常","bridging-v1","original-vocabulary-curation"],["another","/əˈnʌð.ər/","另一个","日常","bridging-v1","original-vocabulary-curation"],["different","/ˈdɪf.ər.ənt/","不同的","日常","bridging-v1","original-vocabulary-curation"],["favorite","/ˈfeɪ.vər.ɪt/","最喜欢的","感受","bridging-v1","original-vocabulary-curation"],["listen","/ˈlɪs.ən/","听","动作","bridging-v1","original-vocabulary-curation"],
  ["garden","/ˈɡɑː.dən/","花园","地方","bridging-v1","original-vocabulary-curation"],["market","/ˈmɑː.kɪt/","市场","地方","bridging-v1","original-vocabulary-curation"],["library","/ˈlaɪ.brər.i/","图书馆","地方","bridging-v1","original-vocabulary-curation"],["kitchen","/ˈkɪtʃ.ɪn/","厨房","地方","bridging-v1","original-vocabulary-curation"],["bathroom","/ˈbɑːθ.ruːm/","浴室","地方","bridging-v1","original-vocabulary-curation"],["playground","/ˈpleɪ.ɡraʊnd/","操场","地方","bridging-v1","original-vocabulary-curation"],["family","/ˈfæm.əl.i/","家庭","家人","bridging-v1","original-vocabulary-curation"],["children","/ˈtʃɪl.drən/","孩子们","人物","bridging-v1","original-vocabulary-curation"],["teacher","/ˈtiː.tʃər/","老师","人物","bridging-v1","original-vocabulary-curation"],["student","/ˈstjuː.dənt/","学生","人物","bridging-v1","original-vocabulary-curation"],
  ["butterfly","/ˈbʌt.ə.flaɪ/","蝴蝶","动物","bridging-v1","original-vocabulary-curation"],["caterpillar","/ˈkæt.ə.pɪl.ər/","毛毛虫","动物","bridging-v1","original-vocabulary-curation"],["dolphin","/ˈdɒl.fɪn/","海豚","动物","bridging-v1","original-vocabulary-curation"],["penguin","/ˈpeŋ.ɡwɪn/","企鹅","动物","bridging-v1","original-vocabulary-curation"],["giraffe","/dʒɪˈrɑːf/","长颈鹿","动物","bridging-v1","original-vocabulary-curation"],["zebra","/ˈzeb.rə/","斑马","动物","bridging-v1","original-vocabulary-curation"],["whale","/weɪl/","鲸","动物","bridging-v1","original-vocabulary-curation"],["octopus","/ˈɒk.tə.pəs/","章鱼","动物","bridging-v1","original-vocabulary-curation"],
  ["weather","/ˈweð.ər/","天气","自然","bridging-v1","original-vocabulary-curation"],["season","/ˈsiː.zən/","季节","时间","bridging-v1","original-vocabulary-curation"],["spring","/sprɪŋ/","春天","时间","bridging-v1","original-vocabulary-curation"],["summer","/ˈsʌm.ər/","夏天","时间","bridging-v1","original-vocabulary-curation"],["autumn","/ˈɔː.təm/","秋天","时间","bridging-v1","original-vocabulary-curation"],["winter","/ˈwɪn.tər/","冬天","时间","bridging-v1","original-vocabulary-curation"],["cloud","/klaʊd/","云","自然","bridging-v1","original-vocabulary-curation"],["forest","/ˈfɒr.ɪst/","森林","自然","bridging-v1","original-vocabulary-curation"],["mountain","/ˈmaʊn.tɪn/","山","自然","bridging-v1","original-vocabulary-curation"],["river","/ˈrɪv.ər/","河","自然","bridging-v1","original-vocabulary-curation"],
  ["carry","/ˈkær.i/","携带","动作","bridging-v1","original-vocabulary-curation"],["follow","/ˈfɒl.əʊ/","跟随","动作","bridging-v1","original-vocabulary-curation"],["choose","/tʃuːz/","选择","动作","bridging-v1","original-vocabulary-curation"],["share","/ʃeər/","分享","动作","bridging-v1","original-vocabulary-curation"],["build","/bɪld/","建造","动作","bridging-v1","original-vocabulary-curation"],["break","/breɪk/","弄坏；休息","动作","bridging-v1","original-vocabulary-curation"],["learn","/lɜːn/","学习","动作","bridging-v1","original-vocabulary-curation"],["count","/kaʊnt/","数数","动作","bridging-v1","original-vocabulary-curation"],["first","/fɜːst/","第一","顺序","bridging-v1","original-vocabulary-curation"],["last","/lɑːst/","最后","顺序","bridging-v1","original-vocabulary-curation"],
  ["little","/ˈlɪt.əl/","小的","描述","bridging-v1","original-vocabulary-curation"],["large","/lɑːdʒ/","大的","描述","bridging-v1","original-vocabulary-curation"],["strong","/strɒŋ/","强壮的","描述","bridging-v1","original-vocabulary-curation"],["quiet","/ˈkwaɪ.ət/","安静的","描述","bridging-v1","original-vocabulary-curation"],["loud","/laʊd/","响亮的","描述","bridging-v1","original-vocabulary-curation"],["bright","/braɪt/","明亮的","描述","bridging-v1","original-vocabulary-curation"],["dark","/dɑːk/","黑暗的","描述","bridging-v1","original-vocabulary-curation"],["early","/ˈɜː.li/","早的","时间","bridging-v1","original-vocabulary-curation"],["ready","/ˈred.i/","准备好的","日常","bridging-v1","original-vocabulary-curation"],["welcome","/ˈwel.kəm/","欢迎","日常","bridging-v1","original-vocabulary-curation"],
  ["apple tree","/ˈæp.əl triː/","苹果树","植物","bridging-v1","original-vocabulary-curation"],["leaf","/liːf/","叶子","植物","bridging-v1","original-vocabulary-curation"],["flowerpot","/ˈflaʊ.ə.pɒt/","花盆","植物","bridging-v1","original-vocabulary-curation"],["seed","/siːd/","种子","植物","bridging-v1","original-vocabulary-curation"],["grass","/ɡrɑːs/","草","植物","bridging-v1","original-vocabulary-curation"],["rose","/rəʊz/","玫瑰","植物","bridging-v1","original-vocabulary-curation"],["daisy","/ˈdeɪ.zi/","雏菊","植物","bridging-v1","original-vocabulary-curation"],["sunflower","/ˈsʌnˌflaʊ.ər/","向日葵","植物","bridging-v1","original-vocabulary-curation"],["branch","/brɑːntʃ/","树枝","植物","bridging-v1","original-vocabulary-curation"],["root","/ruːt/","根","植物","bridging-v1","original-vocabulary-curation"],
  ["duckling","/ˈdʌk.lɪŋ/","小鸭","动物","bridging-v1","original-vocabulary-curation"],["puppy","/ˈpʌp.i/","小狗","动物","bridging-v1","original-vocabulary-curation"],["kitten","/ˈkɪt.ən/","小猫","动物","bridging-v1","original-vocabulary-curation"],["chick","/tʃɪk/","小鸡","动物","bridging-v1","original-vocabulary-curation"],["calf","/kɑːf/","小牛","动物","bridging-v1","original-vocabulary-curation"],["foal","/fəʊl/","小马驹","动物","bridging-v1","original-vocabulary-curation"],["feather","/ˈfeð.ər/","羽毛","动物","bridging-v1","original-vocabulary-curation"],["wing","/wɪŋ/","翅膀","动物","bridging-v1","original-vocabulary-curation"],["tail","/teɪl/","尾巴","动物","bridging-v1","original-vocabulary-curation"],["paw","/pɔː/","爪子","动物","bridging-v1","original-vocabulary-curation"],
  ["grandparent","/ˈɡrænˌpeə.rənt/","祖父母","家人","bridging-v1","original-vocabulary-curation"],["cousin","/ˈkʌz.ən/","堂（表）兄弟姐妹","家人","bridging-v1","original-vocabulary-curation"],["uncle","/ˈʌŋ.kəl/","叔叔；舅舅","家人","bridging-v1","original-vocabulary-curation"],["aunt","/ɑːnt/","姑姑；姨姨","家人","bridging-v1","original-vocabulary-curation"],["baby","/ˈbeɪ.bi/","婴儿","家人","bridging-v1","original-vocabulary-curation"],["grown-up","/ˈɡrəʊn.ʌp/","大人","人物","bridging-v1","original-vocabulary-curation"],["neighbor","/ˈneɪ.bər/","邻居","人物","bridging-v1","original-vocabulary-curation"],["friendship","/ˈfrend.ʃɪp/","友谊","感受","bridging-v1","original-vocabulary-curation"],["kindness","/ˈkaɪnd.nəs/","友善","感受","bridging-v1","original-vocabulary-curation"],["team","/tiːm/","小组","人物","bridging-v1","original-vocabulary-curation"],
  ["pencil","/ˈpen.səl/","铅笔","学习","bridging-v1","original-vocabulary-curation"],["crayon","/ˈkreɪ.ɒn/","蜡笔","学习","bridging-v1","original-vocabulary-curation"],["marker","/ˈmɑː.kər/","记号笔","学习","bridging-v1","original-vocabulary-curation"],["eraser","/ɪˈreɪ.zər/","橡皮","学习","bridging-v1","original-vocabulary-curation"],["scissors","/ˈsɪz.əz/","剪刀","学习","bridging-v1","original-vocabulary-curation"],["glue","/ɡluː/","胶水","学习","bridging-v1","original-vocabulary-curation"],["picture","/ˈpɪk.tʃər/","图画","学习","bridging-v1","original-vocabulary-curation"],["story","/ˈstɔː.ri/","故事","学习","bridging-v1","original-vocabulary-curation"],["letter","/ˈlet.ər/","字母","学习","bridging-v1","original-vocabulary-curation"],["number","/ˈnʌm.bər/","数字","学习","bridging-v1","original-vocabulary-curation"],
  ["puddle","/ˈpʌd.əl/","水坑","天气","bridging-v1","original-vocabulary-curation"],["storm","/stɔːm/","暴风雨","天气","bridging-v1","original-vocabulary-curation"],["thunder","/ˈθʌn.dər/","雷声","天气","bridging-v1","original-vocabulary-curation"],["lightning","/ˈlaɪt.nɪŋ/","闪电","天气","bridging-v1","original-vocabulary-curation"],["rainbow","/ˈreɪn.bəʊ/","彩虹","天气","bridging-v1","original-vocabulary-curation"],["sunshine","/ˈsʌn.ʃaɪn/","阳光","天气","bridging-v1","original-vocabulary-curation"],["breeze","/briːz/","微风","天气","bridging-v1","original-vocabulary-curation"],["shadow","/ˈʃæd.əʊ/","影子","自然","bridging-v1","original-vocabulary-curation"],["stone","/stəʊn/","石头","自然","bridging-v1","original-vocabulary-curation"],["shell","/ʃel/","贝壳","自然","bridging-v1","original-vocabulary-curation"],
  ["breakfast","/ˈbrek.fəst/","早餐","食物","bridging-v1","original-vocabulary-curation"],["lunch","/lʌntʃ/","午餐","食物","bridging-v1","original-vocabulary-curation"],["dinner","/ˈdɪn.ər/","晚餐","食物","bridging-v1","original-vocabulary-curation"],["vegetable","/ˈvedʒ.tə.bəl/","蔬菜","食物","bridging-v1","original-vocabulary-curation"],["potato","/pəˈteɪ.təʊ/","土豆","食物","bridging-v1","original-vocabulary-curation"],["cucumber","/ˈkjuː.kʌm.bər/","黄瓜","食物","bridging-v1","original-vocabulary-curation"],["onion","/ˈʌn.jən/","洋葱","食物","bridging-v1","original-vocabulary-curation"],["noodle","/ˈnuː.dəl/","面条","食物","bridging-v1","original-vocabulary-curation"],["sandwich","/ˈsæn.wɪdʒ/","三明治","食物","bridging-v1","original-vocabulary-curation"],["yogurt","/ˈjɒɡ.ət/","酸奶","食物","bridging-v1","original-vocabulary-curation"],
  ["bicycle","/ˈbaɪ.sɪ.kəl/","自行车","交通","bridging-v1","original-vocabulary-curation"],["scooter","/ˈskuː.tər/","滑板车","交通","bridging-v1","original-vocabulary-curation"],["train","/treɪn/","火车","交通","bridging-v1","original-vocabulary-curation"],["airplane","/ˈeə.pleɪn/","飞机","交通","bridging-v1","original-vocabulary-curation"],["helicopter","/ˈhel.ɪˌkɒp.tər/","直升机","交通","bridging-v1","original-vocabulary-curation"],["subway","/ˈsʌb.weɪ/","地铁","交通","bridging-v1","original-vocabulary-curation"],["helmet","/ˈhel.mɪt/","头盔","安全","bridging-v1","original-vocabulary-curation"],["seat belt","/ˈsiːt belt/","安全带","安全","bridging-v1","original-vocabulary-curation"],["crosswalk","/ˈkrɒs.wɔːk/","人行横道","安全","bridging-v1","original-vocabulary-curation"],["traffic light","/ˈtræf.ɪk laɪt/","交通灯","安全","bridging-v1","original-vocabulary-curation"],
  ["left","/left/","左边","方位","bridging-v1","original-vocabulary-curation"],["right","/raɪt/","右边","方位","bridging-v1","original-vocabulary-curation"],["near","/nɪər/","近","方位","bridging-v1","original-vocabulary-curation"],["far","/fɑːr/","远","方位","bridging-v1","original-vocabulary-curation"],["upstairs","/ˌʌpˈsteəz/","楼上","方位","bridging-v1","original-vocabulary-curation"],["downstairs","/ˌdaʊnˈsteəz/","楼下","方位","bridging-v1","original-vocabulary-curation"],["forward","/ˈfɔː.wəd/","向前","方位","bridging-v1","original-vocabulary-curation"],["backward","/ˈbæk.wəd/","向后","方位","bridging-v1","original-vocabulary-curation"],["around","/əˈraʊnd/","周围","方位","bridging-v1","original-vocabulary-curation"],["corner","/ˈkɔː.nər/","角落","方位","bridging-v1","original-vocabulary-curation"],
  ["begin","/bɪˈɡɪn/","开始","动作","bridging-v1","original-vocabulary-curation"],["finish","/ˈfɪn.ɪʃ/","完成","动作","bridging-v1","original-vocabulary-curation"],["forget","/fəˈɡet/","忘记","动作","bridging-v1","original-vocabulary-curation"],["practice","/ˈpræk.tɪs/","练习","动作","bridging-v1","original-vocabulary-curation"],["tired","/ˈtaɪəd/","累的","感受","bridging-v1","original-vocabulary-curation"],["thirsty","/ˈθɜː.sti/","口渴的","感受","bridging-v1","original-vocabulary-curation"],["hungry","/ˈhʌŋ.ɡri/","饿的","感受","bridging-v1","original-vocabulary-curation"],["surprised","/səˈpraɪzd/","惊讶的","感受","bridging-v1","original-vocabulary-curation"],
]);

const CHINESE_DIGITS = Object.freeze(["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"]);

export function chineseNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 100) throw new Error("unsupported-speech-number");
  if (number < 10) return CHINESE_DIGITS[number];
  if (number === 100) return "一百";
  const tens = Math.floor(number / 10);
  const ones = number % 10;
  return `${tens === 1 ? "" : CHINESE_DIGITS[tens]}十${ones ? CHINESE_DIGITS[ones] : ""}`;
}

export function poemSpeechIds(poemIndex) {
  const prefix = POEMS[poemIndex]?.id || `poem-${String(poemIndex + 1).padStart(3, "0")}`;
  return {
    header: `${prefix}:header`,
    line: (lineIndex) => `${prefix}:line-${String(lineIndex + 1).padStart(2, "0")}`,
  };
}

export function englishItemId(wordIndex) {
  return wordIndex < 65 ? `word-${String(wordIndex + 1).padStart(3, "0")}` : `word-${ENGLISH[wordIndex][0].toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export function englishWordSpeechId(wordIndex) {
  return `${englishItemId(wordIndex)}:pronunciation`;
}

export function mathSpeechContentIds(question) {
  const match = String(question).match(/^(\d+)\s*([+\-−])\s*(\d+)/);
  if (!match) return [];
  const operator = match[2] === "+" ? "plus" : "minus";
  return [
    `math:number-${String(Number(match[1])).padStart(3, "0")}`,
    `math:operator-${operator}`,
    `math:number-${String(Number(match[3])).padStart(3, "0")}`,
    "math:question-result",
  ];
}

const fixedEntries = [
  { contentId: "math:operator-plus", locale: "zh-CN", text: "加" },
  { contentId: "math:operator-minus", locale: "zh-CN", text: "减" },
  { contentId: "math:question-result", locale: "zh-CN", text: "等于几？" },
  { contentId: "prompt:math-sequence", locale: "zh-CN", text: "点击问号格，选出它应该是哪个数字，按一递增顺序。" },
  { contentId: "prompt:sudoku", locale: "zh-CN", text: "把一到四填入每行每列，四乘四入门版，含比较、分类、形状思维。" },
  { contentId: "prompt:english-daily", locale: "zh-CN", text: "拼读并朗读下面的单词，读完点完成今日打卡。" },
];

const poemEntries = POEMS.flatMap((poem, poemIndex) => {
  const legacyPrefix = poem.id || `poem-${String(poemIndex + 1).padStart(3, "0")}`;
  const legacyEntries = [
    { contentId: `${legacyPrefix}:header`, locale: "zh-CN", text: `古诗《${poem.t}》，${poem.a}` },
    ...poem.c.map((line, lineIndex) => ({
      contentId: `${legacyPrefix}:line-${String(lineIndex + 1).padStart(2, "0")}`,
      locale: "zh-CN",
      text: line.replace(/[，。！？、；：]/g, ""),
    })),
  ];
  return legacyEntries;
});

const englishEntries = ENGLISH.map((word, wordIndex) => ({
  contentId: englishWordSpeechId(wordIndex),
  locale: "en-US",
  text: word[0],
}));

const mathNumberEntries = Array.from({ length: 101 }, (_, number) => ({
  contentId: `math:number-${String(number).padStart(3, "0")}`,
  locale: "zh-CN",
  text: chineseNumber(number),
}));

const reviewPromptEntries = Array.from({ length: 28 }, (_, index) => {
  const days = index + 1;
  return {
    contentId: `prompt:english-review-${String(days).padStart(2, "0")}`,
    locale: "zh-CN",
    text: `按月回看之前朗读过的单词，最近${chineseNumber(days)}天。`,
  };
});

export const CORE_LEARNING_SPEECH_ENTRIES = Object.freeze([
  ...LITERACY_SPEECH_ENTRIES,
  ...fixedEntries,
  ...poemEntries,
  ...englishEntries,
  ...mathNumberEntries,
  ...reviewPromptEntries,
]);
