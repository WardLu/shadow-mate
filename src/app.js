
/* =========================================================
   影伴学习任务台 —— 数据层
   ========================================================= */
const HANZI = [
  ["一","yī","一个"],["二","èr","二月"],["三","sān","三天"],["十","shí","十天"],["人","rén","大人"],
  ["口","kǒu","口水"],["手","shǒu","小手"],["日","rì","日子"],["月","yuè","月儿"],["水","shuǐ","水果"],
  ["火","huǒ","火山"],["木","mù","木头"],["山","shān","大山"],["石","shí","石头"],["田","tián","田地"],
  ["土","tǔ","土地"],["上","shàng","上下"],["下","xià","下雨"],["大","dà","大门"],["小","xiǎo","小猫"],
  ["中","zhōng","中间"],["天","tiān","天空"],["王","wáng","王子"],["马","mǎ","马车"],["牛","niú","水牛"],
  ["羊","yáng","山羊"],["鸟","niǎo","小鸟"],["虫","chóng","虫子"],["云","yún","白云"],["雨","yǔ","下雨"],
  ["风","fēng","大风"],["花","huā","花朵"],["草","cǎo","小草"],["树","shù","大树"],["叶","yè","叶子"],
  ["米","mǐ","大米"],["牙","yá","牙齿"],["目","mù","目光"],["耳","ěr","耳朵"],["足","zú","足球"],
  ["心","xīn","开心"],["头","tóu","头发"],["力","lì","力气"],["刀","dāo","小刀"],["尺","chǐ","尺子"],
  ["书","shū","书本"],["笔","bǐ","铅笔"],["学","xué","学习"],["生","shēng","学生"],["门","mén","大门"],
  ["车","chē","火车"],["飞","fēi","飞机"],["鱼","yú","小鱼"],["瓜","guā","西瓜"],["果","guǒ","水果"],
  ["豆","dòu","红豆"],["红","hóng","红色"],["白","bái","白云"],["黑","hēi","黑夜"],["黄","huáng","黄色"],
  ["开","kāi","开门"],["关","guān","关门"],["来","lái","来去"],["去","qù","回去"],["多","duō","多少"],
  ["少","shǎo","多少"],["前","qián","前面"],["后","hòu","后面"],["左","zuǒ","左边"],["右","yòu","右边"],
  ["里","lǐ","里面"],["外","wài","外面"],["东","dōng","东西"],["西","xī","东西"],["南","nán","南方"],
  ["北","běi","北方"],["春","chūn","春天"],["夏","xià","夏天"],["秋","qiū","秋天"],["冬","dōng","冬天"],
  ["早","zǎo","早上"],["晚","wǎn","晚上"],["明","míng","明天"],["年","nián","新年"],["时","shí","时间"],
  ["走","zǒu","走路"],["跑","pǎo","跑步"],["跳","tiào","跳高"],["笑","xiào","笑话"],["哭","kū","哭声"],
  ["好","hǎo","好人"],["坏","huài","坏事"],["高","gāo","高山"],["低","dī","低头"],["长","cháng","长河"],
  ["短","duǎn","短发"],["方","fāng","方块"],["圆","yuán","圆圈"]
];

const POEMS = [
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
  {g:"三年级上",t:"山行",a:"杜牧",c:["远上寒山石径斜，","白云生处有人家。","停车坐爱枫林晚，","霜叶红于二月花。"]}
];

const STROKES = ["点","横","竖","撇","捺","提","折","钩"];
const WRITE_WORDS = ["一二三人","上下大","口手日","月水火","木山中","田土石","天王马","牛羊鸟"];

const ENGLISH = [
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
  ["eight","/eɪt/","八","数字"],  ["nine","/naɪn/","九","数字"],["ten","/ten/","十","数字"]
];

/* 积分打卡：加分项 / 减分项目（取自文档第 2 页） */
const POINT_ITEMS = [
  {group:"加分项",   name:"一起做家务",   desc:"收拾/洗碗",     pts:2},
  {group:"加分项",   name:"认真完成学习", desc:"",              pts:3},
  {group:"加分项",   name:"帮带带弟弟",   desc:"",              pts:2},
  {group:"加分项",   name:"古诗词跟读",   desc:"",              pts:3},
  {group:"减分项目", name:"撒谎",         desc:"",              pts:-10},
  {group:"减分项目", name:"白天摸当众摸鸡鸡", desc:"",          pts:-2},
  {group:"减分项目", name:"不收玩具",     desc:"",              pts:-3}
];

/* 小花生APP 热门书单（绘本读物模块展示用，结构参照小花生书库） */
const PEANUT_BOOKS = [
  {t:"牛津阅读树 Oxford Reading Tree", a:"Roderick Hunt", tag:"分级 L1-9"},
  {t:"红火箭 Red Rocket Readers",       a:"Pam Holden",    tag:"分级 入门"},
  {t:"培生儿童英语分级阅读",            a:"Pearson",       tag:"分级"},
  {t:"饼干狗 Biscuit",                  a:"A. S. Capucilli",tag:"绘本"},
  {t:"苍蝇小子 Fly Guy",                a:"Tedd Arnold",   tag:"桥梁"},
  {t:"小猪小象 Elephant&Piggie",        a:"Mo Willems",    tag:"绘本"},
  {t:"棕色的熊 Brown Bear",             a:"Bill Martin Jr.",tag:"绘本"},
  {t:"好饿的毛毛虫 The Very Hungry Caterpillar", a:"Eric Carle", tag:"绘本"},
  {t:"廖彩杏书单",                      a:"廖彩杏",        tag:"英文书单"},
  {t:"汪培珽书单",                      a:"汪培珽",        tag:"英文书单"},
  {t:"吴敏兰书单",                      a:"吴敏兰",        tag:"英文书单"},
  {t:"I Can Read 分级",                 a:"HarperCollins", tag:"分级"}
];

/* =========================================================
   状态 / 存档层（localStorage 永久存档）
   ========================================================= */
const STORE_KEY = "shadow_mate_workbench_v1";

function readStoredState(){
  const raw = localStorage.getItem(STORE_KEY);
  if(raw === null) return {};
  try{
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  }catch(error){
    console.warn("忽略无法解析的本地存档", error);
  }
  return {};
}

let store = readStoredState();
if(!store.checkins) store.checkins = {};   // {date: {module:true}}
if(!store.extra) store.extra = {};         // 扩展记录（如数学题数）
if(!store.points) store.points = {};       // {ym: {itemIdx: {day:1}}} 积分打卡记录
if(!store.bookShelf) store.bookShelf = {};  // {bookIdx:1} 绘本已读标记
if(!store.peanutLog) store.peanutLog = [];  // [{title,date,rating}] 小花生阅读记录
if(!store.peanutRead) store.peanutRead = {}; // {bookIdx:1} 小花生书单已读标记

function save(){
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
  window.cloudSync?.schedule();
}

function todayKey(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function dayIndex(){
  const d = new Date(); d.setHours(0,0,0,0);
  const start = new Date(d.getFullYear(),0,1);
  return Math.floor((d - start)/86400000);
}
function dateKeyOffset(off){
  const d = new Date(); d.setHours(0,0,0,0);
  d.setDate(d.getDate()-off);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function isChecked(mod){
  const t = todayKey();
  return !!(store.checkins[t] && store.checkins[t][mod]);
}
function doCheck(mod){
  const t = todayKey();
  if(!store.checkins[t]) store.checkins[t] = {};
  store.checkins[t][mod] = true;
  save();
}
function streak(mod){
  let s = 0;
  for(let i=0;i<400;i++){
    const k = dateKeyOffset(i);
    if(store.checkins[k] && store.checkins[k][mod]) s++;
    else if(i>0) break;
  }
  return s;
}
function totalChecked(mod){
  let n = 0;
  for(const k in store.checkins) if(store.checkins[k][mod]) n++;
  return n;
}

/* 积分打卡辅助 */
function ymKey(){ const d=new Date(); return d.getFullYear()+"-"+(d.getMonth()+1); }
function pointOn(itemIdx, day){
  const ym = ymKey();
  return !!(store.points[ym] && store.points[ym][itemIdx] && store.points[ym][itemIdx][day]);
}
function togglePoint(itemIdx, day){
  const ym = ymKey();
  if(!store.points[ym]) store.points[ym] = {};
  if(!store.points[ym][itemIdx]) store.points[ym][itemIdx] = {};
  if(store.points[ym][itemIdx][day]) delete store.points[ym][itemIdx][day];
  else store.points[ym][itemIdx][day] = 1;
  save();
}
function itemMonthTotal(itemIdx){
  const ym = ymKey();
  const rec = store.points[ym] && store.points[ym][itemIdx];
  if(!rec) return 0;
  return POINT_ITEMS[itemIdx].pts * Object.keys(rec).length;
}
function monthTotal(){
  let s = 0;
  for(let i=0;i<POINT_ITEMS.length;i++) s += itemMonthTotal(i);
  return s;
}
function dayTotal(day){
  let s = 0;
  for(let i=0;i<POINT_ITEMS.length;i++) if(pointOn(i,day)) s += POINT_ITEMS[i].pts;
  return s;
}

/* =========================================================
   工具
   ========================================================= */
function $(html){ const t=document.createElement("template"); t.innerHTML=html.trim(); return t.content.firstChild; }
function el(id){ return document.getElementById(id); }
function speak(t){ try{ const u=new SpeechSynthesisUtterance(t); u.lang="en-US"; speechSynthesis.cancel(); speechSynthesis.speak(u);}catch(e){} }
function bilibili(q){ return "https://search.bilibili.com/all?keyword="+encodeURIComponent(q); }

/* =========================================================
   渲染：首页
   ========================================================= */
function renderHome(){
  const di = dayIndex();
  const hz = HANZI[(di*2)%HANZI.length];
  const poem = POEMS[di%POEMS.length];
  const en = ENGLISH[di%ENGLISH.length];
  const checkedToday = ["chinese","math","english"].filter(isChecked).length;
  const m = new Date().getMonth()+1;
  const main = el("main");
  main.innerHTML = "";
  main.appendChild($(`
    <div class="banner">
      <div class="t">⛏️ 挖掘机小队长，今天也要加油哦！</div>
      <div class="d">今日已打卡 ${checkedToday}/3 个模块 · 语文今日新字「${hz[0]}」· 古诗《${poem.t}》· 英语单词「${en[0]}」</div>
    </div>
  `));

  const stat = $(`
    <div class="card">
      <h3>📊 今日成长数据</h3>
      <div class="stat-grid">
        <div class="stat"><div class="n">${checkedToday}/3</div><div class="t">今日打卡</div></div>
        <div class="stat"><div class="n">${streak("chinese")}</div><div class="t">语文连续(天)</div></div>
        <div class="stat"><div class="n">${totalChecked("math")}</div><div class="t">数学累计打卡</div></div>
        <div class="stat"><div class="n">${totalChecked("english")}</div><div class="t">英语累计打卡</div></div>
      </div>
      <div class="progressbar"><i></i></div>
    </div>
  `);
  main.appendChild(stat);
  stat.querySelector(".progressbar i").style.width = (checkedToday/3*100)+"%";

  // 三大模块快捷入口
  const mk = (mod,em,t,d)=>$(`
    <div class="card" data-go="${mod}">
      <h3>${em} ${t}</h3>
      <div class="desc">${d}</div>
      <span class="pill">${isChecked(mod)?"✅ 今日已打卡":"今日待打卡"}</span>
    </div>
  `);
  main.appendChild(mk("chinese","📖","语文学习","识字·古诗词·写字 每日打卡"));
  main.appendChild(mk("math","🔢","数学与数感","口算·数感游戏·数独 每日打卡"));
  main.appendChild(mk("english","🔤","英语学习","主题单词 每日推送与朗读打卡"));
  main.appendChild(mk("book","📚","绘本读物","多地优质绘本 · 跟读+思考题"));
  main.appendChild(mk("points","⭐","积分打卡","加分减分 · 月度行为积分表"));
  main.querySelectorAll("[data-go]").forEach(c=>c.onclick=()=>switchMod(c.dataset.go));
  main.appendChild($(`<div class="footer">🚜 本机离线保存 · 家长登录后自动同步云端</div>`));
}

/* =========================================================
   渲染：语文
   ========================================================= */
function renderChinese(){
  const di = dayIndex();
  const main = el("main"); main.innerHTML="";
  main.appendChild(modTitle("📖","语文学习"));

  // 识字打卡（每日2新字 + 复习昨日）
  const i1 = (di*2)%HANZI.length, i2=(di*2+1)%HANZI.length;
  const c1=HANZI[i1], c2=HANZI[i2];
  const ri = ((di-1)*2)%HANZI.length; const rc=HANZI[(ri+1)%HANZI.length];
  const card1 = $(`
    <div class="card">
      <h3>✏️ 识字打卡 <span class="pill">每日 2 新字 + 复习</span></h3>
      <div class="desc">3000 常用字按频次排序，每天学 2 个新字并复习旧字。今日新字：</div>
      <div class="grid2">
        <div class="mini-card"><div class="big">${c1[0]}</div><div class="py">${c1[1]}</div><div class="label">${c1[2]}</div></div>
        <div class="mini-card"><div class="big">${c2[0]}</div><div class="py">${c2[1]}</div><div class="label">${c2[2]}</div></div>
      </div>
      <div class="desc mt-12">🔁 复习昨日字：<b>${HANZI[ri][0]}</b> ${HANZI[ri][1]} · <b>${rc[0]}</b> ${rc[1]}</div>
      <a class="video-link" href="${bilibili("小学语文 识字 "+c1[0]+c2[0])}" target="_blank">▶ B站教学视频</a>
      <div class="spacer-12"></div>
      ${checkinBtn("chinese","识字")}
    </div>
  `);
  main.appendChild(card1);

  // 古诗词
  const p = POEMS[di%POEMS.length];
  const card2 = $(`
    <div class="card">
      <h3>📜 背诵古诗词 <span class="pill">${p.g}</span></h3>
      <div class="poem-title">《${p.t}》</div>
      <div class="poem-meta">${p.a} · 人教版</div>
      <div class="poem-body">${p.c.join("<br>")}</div>
      <div class="text-center"><a class="video-link" href="${bilibili(p.t+" 朗诵")}" target="_blank">▶ 跟读视频</a></div>
      <div class="spacer-12"></div>
      ${checkinBtn("chinese","古诗")}
    </div>
  `);
  main.appendChild(card2);

  // 写字打卡
  const strokesHtml = STROKES.map(s=>`<span class="stroke-chip">${s}</span>`).join("");
  const wordsHtml = WRITE_WORDS.slice(0,4).map(w=>`<div class="write-grid">${[...w].map(ch=>`<div class="tian">${ch}</div>`).join("")}</div>`).join('<div class="spacer-8"></div>');
  const card3 = $(`
    <div class="card">
      <h3>✍️ 写字打卡 <span class="pill">8 基础笔画 + 控笔</span></h3>
      <div class="desc">8 个基础笔画：${strokesHtml}</div>
      <div class="desc">今日练习汉字（从简到难，控笔临摹）：</div>
      ${wordsHtml}
      <div class="spacer-12"></div>
      <button class="checkin" type="button" data-print>🖨️ 打印 A4 字帖</button>
      <div class="spacer-10"></div>
      ${checkinBtn("chinese","写字")}
    </div>
  `);
  main.appendChild(card3);
  card3.querySelector("[data-print]").onclick = () => window.print();
}

/* =========================================================
   渲染：数学与数感
   ========================================================= */
let mathLevel = 10, mathAns = 0;
function genQuiz(){
  const a = Math.floor(Math.random()*(mathLevel+1));
  const b = Math.floor(Math.random()*(mathLevel+1));
  const op = Math.random()<0.5 ? "+" : "−";
  if(op==="+"){ mathAns=a+b; return `${a} ${op} ${b} = ?`; }
  else { const big=Math.max(a,b), small=Math.min(a,b); mathAns=big-small; return `${big} ${op} ${small} = ?`; }
}
function renderMath(){
  const main = el("main"); main.innerHTML="";
  main.appendChild(modTitle("🔢","数学与数感"));

  // 口算
  const q = genQuiz();
  const lvls = [10,20,50,100];
  const lvlHtml = lvls.map(n=>`<button class="lvl-btn ${n===mathLevel?'active':''}" data-lvl="${n}">${n}以内</button>`).join("");
  const card1 = $(`
    <div class="card">
      <h3>🧮 口算打卡 <span class="pill">10/20/50/100 以内加减</span></h3>
      <div class="lvl-row">${lvlHtml}</div>
      <div class="quiz-box">
        <div class="quiz-q" id="qq">${q}</div>
        <input class="quiz-input" id="qa" type="number" inputmode="numeric" placeholder="?">
        <div class="feedback" id="qf"></div>
      </div>
      <button class="checkin" id="qsubmit">✔ 提交答案</button>
      <div class="spacer-8"></div>
      ${checkinBtn("math","口算")}
    </div>
  `);
  main.appendChild(card1);
  card1.querySelectorAll("[data-lvl]").forEach(b=>b.onclick=()=>{ mathLevel=+b.dataset.lvl; renderMath(); });
  el("qsubmit").onclick=()=>{
    const v = el("qa").value;
    const f = el("qf");
    if(v===""){ f.textContent="请先写出答案哦"; f.className="feedback no"; return; }
    if(+v===mathAns){ f.textContent="🎉 答对啦，真棒！"; f.className="feedback ok"; }
    else { f.textContent=`再想想～正确答案是 ${mathAns}`; f.className="feedback no"; }
  };

  // 数感：数字填写 1-100 找缺失
  const miss = Math.floor(Math.random()*100)+1;
  let cells="";
  for(let k=1;k<=20;k++){
    const num = (k===10)? miss : (k<10? k : k+1);
    cells += `<div class="num-cell ${k===10?'miss':''}" data-num="${k===10?miss:0}">${k===10?'?':num}</div>`;
  }
  const card2 = $(`
    <div class="card">
      <h3>🔢 数感星球 · 数字填写 <span class="pill">1-100</span></h3>
      <div class="desc">点击问号格，说出它应该是哪个数字（按 1 递增顺序）。</div>
      <div class="num-grid">${cells}</div>
      <div class="feedback text-center" id="nf"></div>
    </div>
  `);
  main.appendChild(card2);
  const missCell = card2.querySelector(".num-cell.miss");
  missCell.onclick=()=>{ const nf=el("nf"); const ans=prompt("这个格子应该是数字几？"); if(ans!==null){ if(+ans===miss){ nf.textContent="✅ 正确！数列规律是每次 +1"; nf.className="feedback ok"; missCell.classList.add("found"); missCell.textContent=miss; } else { nf.textContent=`不对哦，看看前后数字～`; nf.className="feedback no"; } } };

  // 数独 4x4
  const card3 = $(`
    <div class="card">
      <h3>♟️ 数独游戏 <span class="pill">数感阶段</span></h3>
      <div class="desc">把 1-4 填入每行每列（4×4 入门版，含比较/分类/形状思维）。</div>
      <div class="sudoku" id="sudoku"></div>
      <div class="feedback text-center" id="sf"></div>
      <div class="spacer-10"></div>
      ${checkinBtn("math","数感")}
    </div>
  `);
  main.appendChild(card3);
  buildSudoku();
}

function buildSudoku(){
  // 固定一个合法解，挖空部分
  const sol = [
    [1,2,3,4],
    [3,4,1,2],
    [2,1,4,3],
    [4,3,2,1]
  ];
  const blanks = new Set([1,4,6,9,11,14]); // 挖空位置(0-indexed)
  const box = el("sudoku"); if(!box) return;
  box.innerHTML="";
  let idx=0;
  for(let r=0;r<4;r++) for(let c=0;c<4;c++){
    const v=sol[r][c];
    if(blanks.has(idx)){
      const inp=document.createElement("div");
      inp.innerHTML=`<input type="number" min="1" max="4" data-r="${r}" data-c="${c}">`;
      box.appendChild(inp.firstChild);
    } else {
      const d=document.createElement("div");
      d.className="fixed"; d.textContent=v;
      box.appendChild(d);
    }
    idx++;
  }
  const sf=el("sf");
  box.querySelectorAll("input").forEach(inp=>inp.onchange=()=>{
    // 简单校验行/列/宫
    const r=+inp.dataset.r, c=+inp.dataset.c, val=+inp.value;
    let ok=true;
    if(val<1||val>4) ok=false;
    // 检查同行
    for(let cc=0;cc<4;cc++){ const cell=box.children[r*4+cc]; const cv=cell.querySelector? (cell.querySelector("input")?+cell.querySelector("input").value: +cell.textContent):null; if(cc!==c && cv===val){ok=false;} }
    if(ok) sf.textContent="继续加油，把空格都填完吧！"; else sf.textContent="这一格和别处重复啦～";
  });
}

/* =========================================================
   渲染：英语
   ========================================================= */
function renderEnglish(){
  const di = dayIndex();
  const main = el("main"); main.innerHTML="";
  main.appendChild(modTitle("🔤","英语学习"));
  // 每日推送 1~2 词
  const w1 = ENGLISH[di%ENGLISH.length];
  const w2 = ENGLISH[(di+1)%ENGLISH.length];
  const card1 = $(`
    <div class="card">
      <h3>🔤 今日主题单词 <span class="pill">每日推送</span></h3>
      <div class="desc">拼读并朗读下面的单词，读完点「完成今日打卡」。</div>
      <div class="word-card">
        <div class="word-en">${w1[0]}</div>
        <div class="word-ph">${w1[1]}</div>
        <div class="word-cn">${w1[2]} · ${w1[3]}</div>
        <button class="speak-btn" type="button" data-speak="0">🔊 听发音</button>
      </div>
      <div class="word-card">
        <div class="word-en">${w2[0]}</div>
        <div class="word-ph">${w2[1]}</div>
        <div class="word-cn">${w2[2]} · ${w2[3]}</div>
        <button class="speak-btn" type="button" data-speak="1">🔊 听发音</button>
      </div>
      <div class="spacer-10"></div>
      ${checkinBtn("english","单词")}
    </div>
  `);
  main.appendChild(card1);
  const spokenWords = [w1[0], w2[0]];
  card1.querySelectorAll("[data-speak]").forEach((button) => {
    button.onclick = () => speak(spokenWords[Number(button.dataset.speak)]);
  });

  // 按月回看往期单词
  const m = new Date().getMonth();
  let chips="";
  for(let d=1; d<=Math.min(28,new Date().getDate()+0); d++){
    const k = (m*31 + d*2)%ENGLISH.length; // 与推送算法一致的近似回看
    const w = ENGLISH[(di - d + ENGLISH.length*10)%ENGLISH.length];
    chips += `<span class="mr-chip">${w[0]}</span>`;
  }
  const card2 = $(`
    <div class="card">
      <h3>📅 往期单词回看 <span class="pill">本月</span></h3>
      <div class="desc">按月回看之前朗读过的单词（最近 ${Math.min(28,new Date().getDate())} 天）：</div>
      <div class="month-review">${chips}</div>
    </div>
  `);
  main.appendChild(card2);
}

/* =========================================================
   渲染：成长
   ========================================================= */
function renderGrow(){
  const main = el("main"); main.innerHTML="";
  main.appendChild(modTitle("🌱","成长记录"));
  const total = totalChecked("chinese")+totalChecked("math")+totalChecked("english");
  const card = $(`
    <div class="card">
      <h3>🏆 打卡总览</h3>
      <div class="stat-grid">
        <div class="stat"><div class="n">${totalChecked("chinese")}</div><div class="t">语文累计(天)</div></div>
        <div class="stat"><div class="n">${totalChecked("math")}</div><div class="t">数学累计(天)</div></div>
        <div class="stat"><div class="n">${totalChecked("english")}</div><div class="t">英语累计(天)</div></div>
        <div class="stat"><div class="n">${total}</div><div class="t">总打卡(次)</div></div>
      </div>
      <div class="desc mt-14">🔥 连续打卡：语文 ${streak("chinese")} 天 · 数学 ${streak("math")} 天 · 英语 ${streak("english")} 天</div>
      <div class="progressbar"><i></i></div>
      <div class="desc mt-6 note-sm">目标：累计 30 次打卡解锁「挖掘机小队长」徽章</div>
    </div>
  `);
  main.appendChild(card);
  card.querySelector(".progressbar i").style.width = Math.min(100,total/30*100)+"%";

  // 日历式最近记录
  let cells="";
  for(let i=29;i>=0;i--){
    const k=dateKeyOffset(i);
    const c=store.checkins[k];
    const n = c? Object.keys(c).length:0;
    const lvl = n>=3?3:n===2?2:n===1?1:0;
    cells += `<div class="cal-cell lvl-${lvl}">${n||""}</div>`;
  }
  const cal = $(`
    <div class="card">
      <h3>📆 近 30 天打卡日历</h3>
      <div class="cal-grid">${cells}</div>
      <div class="desc mt-10 note-sm">🟩 全勤 · 🟩浅 2项 · 🟨 1项 · ⬜ 未打卡</div>
    </div>
  `);
  main.appendChild(cal);
  main.appendChild($(`<div class="footer">🚜 本机离线保存 · 登录后跨设备同步</div>`));
}

/* =========================================================
   渲染：积分打卡
   ========================================================= */
/* 积分卡片辅助 */
const PTS_ICON = {"一起做家务":"🧹","认真完成学习":"📚","帮带带弟弟":"🤝","古诗词跟读":"📜","撒谎":"🚫","白天摸当众摸鸡鸡":"🙈","不收玩具":"🧸"};
let PT_DAY = null;
function ptsCardHTML(it, i, day){
  const done = pointOn(i, day);
  const sub = it.pts < 0;
  const icon = PTS_ICON[it.name] || (sub ? "⚠️" : "🌟");
  return `<div class="pts-card ${sub?'sub':''} ${done?'done':''}">
    <div class="pts-ic">${icon}</div>
    <div class="pts-info">
      <div class="pts-name">${it.name}</div>
      ${it.desc?`<div class="pts-desc">${it.desc}</div>`:""}
    </div>
    <div class="pts-badge">${it.pts>0?'+':'-'}${Math.abs(it.pts)}分</div>
    <button class="pts-toggle" data-i="${i}">${done?'✓':'＋'}</button>
  </div>`;
}

function renderPoints(){
  const main = el("main"); main.innerHTML="";
  main.appendChild(modTitle("⭐","积分打卡"));
  const today = new Date().getDate();
  const ymLabel = new Date().getFullYear()+"年"+(new Date().getMonth()+1)+"月";
  if(PT_DAY===null) PT_DAY = today;
  const activeDay = PT_DAY;
  const mt = monthTotal();
  const dt = dayTotal(activeDay);

  // 挖掘机主题横幅
  main.appendChild($(`<div class="exc-banner">
      <div class="em">🚜</div>
      <div><div class="t">挖掘机小队长 · 积分打卡榜</div><div class="d">完成好习惯就点亮小星星，绿挖挖帮你攒积分！</div></div>
      <div class="badge">⭐ ${mt>0?'+':''}${mt} 分</div>
    </div>`));

  // 顶部统计
  main.appendChild($(`<div class="card">
      <h3>🚜 本月积分</h3>
      <div class="stat-grid">
        <div class="stat"><div class="n">${mt>0?'+':''}${mt}</div><div class="t">本月累计</div></div>
        <div class="stat"><div class="n">${dt>0?'+':''}${dt}</div><div class="t">${activeDay}日积分</div></div>
      </div>
    </div>`));

  // 积分日历（圆角 chip，可补打卡）
  let chips="";
  for(let d=1;d<=31;d++){
    const v=dayTotal(d);
    const cls=(d===activeDay?"active ":"")+(v>0?"pos":v<0?"neg":"");
    chips+=`<div class="cal-chip ${cls}" data-d="${d}">${d}</div>`;
  }
  const calCard=$(`<div class="card">
      <h3>📅 积分日历 <span class="pill">${ymLabel}</span></h3>
      <div class="desc">点日期可以给过去的某一天补打卡～绿色=有加分，红色=有扣分。</div>
      <div class="cal">${chips}</div>
    </div>`);
  main.appendChild(calCard);
  calCard.querySelectorAll(".cal-chip").forEach(c=>c.onclick=()=>{PT_DAY=+c.dataset.d; renderPoints();});

  // 打卡区（卡片化）
  const isToday = activeDay===today;
  const head = $(`<div class="card">
      <div class="pts-sec">✨ 为 ${new Date().getMonth()+1}月${activeDay}日 打卡 ${isToday?'<span class="pill">今天</span>':''}</div>
      ${isToday?"":'<button class="checkin danger mb-12" id="backtoday">↩ 回到今天</button>'}
      <div class="pts-sec">🌟 加分项</div>
      ${POINT_ITEMS.filter(it=>it.group==="加分项").map((it)=>ptsCardHTML(it,POINT_ITEMS.indexOf(it),activeDay)).join("")}
      <div class="pts-sec">⚠️ 减分项目</div>
      ${POINT_ITEMS.filter(it=>it.group==="减分项目").map((it)=>ptsCardHTML(it,POINT_ITEMS.indexOf(it),activeDay)).join("")}
    </div>`);
  main.appendChild(head);
  head.querySelectorAll(".pts-toggle").forEach(b=>b.onclick=()=>{ togglePoint(+b.dataset.i, activeDay); renderPoints(); });
  const bt = el("backtoday"); if(bt) bt.onclick=()=>{PT_DAY=today; renderPoints();};

  // 清空
  main.appendChild($(`<div class="card"><button class="checkin danger" id="ptclear">🧹 清空本月积分</button></div>`));
  el("ptclear").onclick=()=>{
    if(confirm("确定清空本月所有积分打卡记录？")){
      delete store.points[ymKey()]; save(); PT_DAY=today; renderPoints();
    }
  };
  main.appendChild($(`<div class="footer">⭐ 每日按日期记录 · 本机离线保存并可同步云端</div>`));
}

/* =========================================================
   渲染：绘本读物（独立栏目）
   ========================================================= */
function renderBook(){
  const main = el("main"); main.innerHTML="";
  main.appendChild(modTitle("📚","绘本读物"));

  const BOOKS = [
    {t:"好饿的毛毛虫",   r:"美国",  a:"艾瑞·卡尔"},
    {t:"棕色的熊，棕色的熊", r:"美国", a:"比尔·马丁"},
    {t:"猜猜我有多爱你", r:"欧盟(英)", a:"山姆·麦克布雷尼"},
    {t:"逃家小兔",       r:"美国",  a:"玛格丽特·怀兹·布朗"},
    {t:"小熊宝宝",       r:"日本",  a:"佐佐木洋子"},
    {t:"点点点",         r:"法国",  a:"埃尔维·杜莱"},
    {t:"是谁嗯嗯在我头上", r:"台湾", a:"维尔纳·霍尔茨瓦特"},
    {t:"爷爷一定有办法", r:"加拿大", a:"菲比·吉尔曼"}
  ];
  const di = dayIndex();
  const b = BOOKS[di % BOOKS.length];

  // 今日绘本 + 打卡
  const card1 = $(`
    <div class="card">
      <h3>📖 今日绘本 <span class="pill">${b.r}</span></h3>
      <div class="desc">《${b.t}》— ${b.a}</div>
      <div class="desc">raza 绘本跟读 · 读后完成思考题；26 个字母口语对练、英语句子书写造句每日推送（3-6 岁）。</div>
      <div class="row">
        <span class="pill">跟读</span><span class="pill">读后思考题</span><span class="pill">句子书写</span><span class="pill">每日推送</span>
      </div>
      <div class="spacer-10"></div>
      ${checkinBtn("book","绘本")}
    </div>
  `);
  main.appendChild(card1);

  // 我的小书架（已读标记，永久存档）
  let shelf = BOOKS.map((bk,i)=>{
    const read = !!store.bookShelf[i];
    return `<div class="mini-card shelf-card" data-bk="${i}">
      <div class="big">${read?'✅':'📕'}</div>
      <div class="py">${bk.t}</div>
      <div class="label">${bk.r}</div>
    </div>`;
  }).join("");
  const readN = Object.keys(store.bookShelf).length;
  const card2 = $(`
    <div class="card">
      <h3>📚 我的小书架 <span class="pill">点击标记已读</span></h3>
      <div class="desc">欧盟、美国、日本、台湾等多地优质绘本，读完并完成思考题后点一下即可标记。</div>
      <div class="grid2">${shelf}</div>
      <div class="desc mt-12">已读 <b>${readN}</b> / ${BOOKS.length} 本</div>
    </div>
  `);
  main.appendChild(card2);
  card2.querySelectorAll("[data-bk]").forEach(c=>{
    c.style.opacity = store.bookShelf[+c.dataset.bk] ? 1 : 0.55;
    c.onclick=()=>{
      const i=+c.dataset.bk;
      if(store.bookShelf[i]) delete store.bookShelf[i]; else store.bookShelf[i]=1;
      save(); renderBook();
    };
  });

  // 小花生APP读物：热门书单 + 我的阅读记录
  const peanutRead = PEANUT_BOOKS.map((b,i)=>{
    const on = !!store.peanutRead[i];
    return `<div class="mini-card peanut-card" data-pb="${i}">
      <div class="big">${on?'✅':'🥜'}</div>
      <div class="py">${b.t}</div>
      <div class="label">${b.tag}</div>
    </div>`;
  }).join("");
  const logRows = store.peanutLog.slice().reverse().map((r,idx)=>{
    const stars = "★".repeat(r.rating)+"☆".repeat(5-r.rating);
    return `<div class="log-row">
      <div class="log-main">${r.title}<span class="log-stars">${stars}</span></div>
      <div class="log-meta">${r.date} <span class="log-del" data-del="${idx}">🗑️</span></div>
    </div>`;
  }).join("");

  const card3 = $(`
    <div class="card">
      <h3>🥜 小花生APP读物 <span class="pill">热门书单</span></h3>
      <div class="desc">小花生热门童书与英文分级书单（牛津树 / 红火箭 / 廖彩杏等），点一下标记已读；下方可手记你自己的阅读记录。</div>
      <div class="grid2">${peanutRead}</div>
      <div class="spacer-12"></div>
      <div class="pts-sec">📒 我的阅读记录</div>
      <div class="peanut-form">
        <input class="peanut-input" id="pbTitle" placeholder="输入书名（如：牛津阅读树 L3）">
        <div class="peanut-stars" id="pbStars">
          ${[1,2,3,4,5].map(n=>`<span class="pstar" data-n="${n}">${n<=3?'★':'☆'}</span>`).join("")}
        </div>
        <button class="checkin mt-8" id="pbAdd">＋ 添加阅读记录</button>
      </div>
      <div class="peanut-log">${logRows || '<div class="desc">还没有记录，添加一本吧～</div>'}</div>
    </div>
  `);
  main.appendChild(card3);

  // 绑定：书单已读标记
  card3.querySelectorAll("[data-pb]").forEach(c=>{
    c.style.opacity = store.peanutRead[+c.dataset.pb] ? 1 : 0.6;
    c.onclick=()=>{
    const i=+c.dataset.pb;
    if(store.peanutRead[i]) delete store.peanutRead[i]; else store.peanutRead[i]=1;
    save(); renderBook();
    };
  });
  // 绑定：评分星
  let rating = 3;
  const starEls = card3.querySelectorAll(".pstar");
  const paintStars = (n)=>starEls.forEach(s=>{ s.textContent = (+s.dataset.n<=n?"★":"☆"); });
  starEls.forEach(s=>s.onclick=()=>{ rating=+s.dataset.n; paintStars(rating); });
  // 绑定：添加记录
  el("pbAdd").onclick=()=>{
    const title = el("pbTitle").value.trim();
    if(!title){ alert("请先输入书名"); return; }
    const d = new Date();
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    store.peanutLog.push({title, date:ds, rating});
    save(); renderBook();
  };
  // 绑定：删除记录
  card3.querySelectorAll("[data-del]").forEach(x=>x.onclick=()=>{
    const i = +x.dataset.del;
    store.peanutLog.splice(store.peanutLog.length-1-i, 1);
    save(); renderBook();
  });

  main.appendChild($(`<div class="footer">📚 本机离线保存 · 登录后跨设备同步</div>`));
}

/* =========================================================
   公共组件
   ========================================================= */
function modTitle(em,t){
  return $(`<div class="module-title"><span class="em">${em}</span><h2>${t}</h2></div>`);
}
function checkinBtn(mod,label){
  const done = isChecked(mod);
  return `<button class="checkin ${done?'done':''}" data-cmod="${mod}" data-clabel="${label}">${done?'✅ 今日已打卡 · '+label:'✔ 完成今日打卡 · '+label}</button>`;
}

/* =========================================================
   导航切换
   ========================================================= */
let CURRENT_MOD = "home";
function switchMod(mod){
  CURRENT_MOD = mod;
  document.querySelectorAll(".navbtn").forEach(b=>b.classList.toggle("active", b.dataset.mod===mod));
  if(mod==="home") renderHome();
  else if(mod==="chinese") renderChinese();
  else if(mod==="math") renderMath();
  else if(mod==="english") renderEnglish();
  else if(mod==="book") renderBook();
  else if(mod==="points") renderPoints();
  else if(mod==="grow") renderGrow();
  // 绑定打卡按钮
  el("main").querySelectorAll("[data-cmod]").forEach(btn=>{
    btn.onclick=()=>{
      const m=btn.dataset.cmod;
      if(!isChecked(m)){ doCheck(m); switchMod(mod); }
    };
  });
  el("main").scrollTop=0;
}

document.querySelectorAll(".navbtn").forEach(b=>b.onclick=()=>switchMod(b.dataset.mod));

// 日期显示
(function(){
  const d=new Date();
  const wk=["日","一","二","三","四","五","六"][d.getDay()];
  el("datepill").textContent=`${d.getMonth()+1}月${d.getDate()}日 周${wk}`;
})();

// 初始渲染
switchMod("home");

window.learningDesk = {
  getState(){
    return JSON.parse(JSON.stringify(store));
  },
  replaceState(next, options = {}){
    store = next && typeof next === "object" ? next : {};
    if(!store.checkins) store.checkins = {};
    if(!store.extra) store.extra = {};
    if(!store.points) store.points = {};
    if(!store.bookShelf) store.bookShelf = {};
    if(!store.peanutLog) store.peanutLog = [];
    if(!store.peanutRead) store.peanutRead = {};
    if(options.persist) localStorage.setItem(STORE_KEY, JSON.stringify(store));
    switchMod(CURRENT_MOD);
  },
  clearLocalData(){
    localStorage.removeItem(STORE_KEY);
    window.location.reload();
  }
};
