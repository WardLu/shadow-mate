function migrateFlags(value, legacyIds) {
  const flags = value && typeof value === "object" && !Array.isArray(value) ? structuredClone(value) : {};
  legacyIds.forEach((id, index) => {
    const key = String(index);
    if (!Object.hasOwn(flags, key)) return;
    if (!Object.hasOwn(flags, id)) flags[id] = flags[key];
    delete flags[key];
  });
  return flags;
}

export function migrateLegacyBookState(state = {}) {
  return {
    bookShelf: migrateFlags(state.bookShelf, LEGACY_BOOK_IDS),
    peanutRead: migrateFlags(state.peanutRead, LEGACY_READING_LIST_IDS),
  };
}

export const BOOK_SOURCE_REFS = Object.freeze({
  "prh-very-hungry-caterpillar": "https://www.penguinrandomhouse.com/books/301943/the-very-hungry-caterpillar-by-eric-carle/",
  "macmillan-brown-bear": "https://us.macmillan.com/books/9780805002010/brownbearbrownbearwhatdoyousee/",
  "prh-snowy-day": "https://www.penguinrandomhouse.com/books/315149/the-snowy-day-by-ezra-jack-keats/",
  "prh-whistle-for-willie": "https://www.penguinrandomhouse.com/books/323291/whistle-for-willie-by-ezra-jack-keats/",
  "prh-good-night-gorilla": "https://www.penguinrandomhouse.com/books/315598/good-night-gorilla-by-peggy-rathmann-illustrated-by-peggy-rathmann/",
  "prh-goodnight-everyone": "https://www.penguinrandomhouse.com/books/545966/goodnight-everyone-by-chris-haughton-illustrated-by-chris-haughton/",
});

const bookRecords = [
  ["book-very-hungry-caterpillar", "好饿的毛毛虫", "美国", "艾瑞克·卡尔", "自然与成长", "可以边读边数毛毛虫吃过的水果，再聊聊它后来发生了什么。", "prh-very-hungry-caterpillar"],
  ["book-brown-bear", "棕色的熊，棕色的熊，你在看什么？", "美国", "比尔·马丁", "颜色与动物", "和孩子一起找找画面里的颜色和动物。", "macmillan-brown-bear"],
  ["book-guess-how-much", "猜猜我有多爱你", "爱尔兰", "山姆·麦克布雷尼", "亲情", "读完后，可以请孩子用动作说说自己有多喜欢家人。", "picture-book-curation-original"],
  ["book-runaway-bunny", "逃家小兔", "美国", "玛格丽特·怀兹·布朗", "亲情与想象", "看看小兔和兔妈妈分别变成了什么。", "picture-book-curation-original"],
  ["book-baby-bear", "小熊宝宝", "日本", "佐佐木洋子", "生活习惯", "跟着画面说说小熊正在做什么。", "picture-book-curation-original"],
  ["book-press-here", "点点点", "法国", "埃尔维·杜莱", "互动与观察", "按书里的提示一起观察颜色和位置变化。", "picture-book-curation-original"],
  ["book-who-did-poo", "是谁嗯嗯在我头上", "德国", "维尔纳·霍尔茨瓦特", "动物与观察", "可以观察动物留下的线索；不想聊身体话题时也可以跳过。", "picture-book-curation-original"],
  ["book-joseph-coat", "爷爷一定有办法", "加拿大", "菲比·吉尔曼", "家庭与创造", "看看爷爷怎样把旧布料改成新东西。", "picture-book-curation-original"],
  ["book-snowy-day", "The Snowy Day", "美国", "Ezra Jack Keats", "天气与日常", "说说彼得在雪地里留下了哪些痕迹。", "prh-snowy-day"],
  ["book-whistle-for-willie", "Whistle for Willie", "美国", "Ezra Jack Keats", "练习与耐心", "聊聊彼得练习吹口哨时做了什么。", "prh-whistle-for-willie"],
  ["book-goodnight-gorilla", "Good Night, Gorilla", "美国", "Peggy Rathmann", "动物与睡前", "一起找找动物们跟着谁离开了动物园。", "prh-good-night-gorilla"],
  ["book-goodnight-everyone", "Goodnight Everyone", "爱尔兰", "Chris Haughton", "动物与睡前", "看看森林里的动物怎样准备睡觉。", "prh-goodnight-everyone"],
  ["book-oxford-tree", "Oxford Reading Tree", "英国", "Roderick Hunt；Alex Brychta 绘", "分级阅读", "按孩子当前的兴趣和阅读能力挑选级别，不必赶进度。", "oxford-reading-tree-official"],
  ["book-red-rocket", "Red Rocket Readers", "新西兰", "Pam Holden", "分级阅读", "从孩子愿意反复读的短书开始，读熟后再换主题。", "red-rocket-publisher"],
  ["book-elephant-piggie", "Elephant & Piggie", "美国", "Mo Willems", "友谊与对话", "可以轮流扮演两位角色读对话。", "elephant-piggie-publisher"],
  ["book-biscuit", "Biscuit", "美国", "Alyssa Satin Capucilli", "日常与动物", "和孩子一起找出故事里小狗做的事情。", "biscuit-publisher"],
];

export const BOOKS = Object.freeze(bookRecords.map(([id, t, r, a, theme, prompt, sourceRef]) => Object.freeze({
  id, t, r, a, theme, prompt, sourceRef,
  agePackages: ["foundation-v2", "bridging-v1"],
  promptSourceRef: "original-reading-prompts",
  sourceUrl: BOOK_SOURCE_REFS[sourceRef] || null,
  bibliographicVerification: BOOK_SOURCE_REFS[sourceRef] ? "publisher-checked" : "not-individually-verified",
})));

export const LEGACY_BOOK_IDS = Object.freeze([
  "book-very-hungry-caterpillar",
  "book-brown-bear",
  "book-guess-how-much",
  "book-runaway-bunny",
  "book-baby-bear",
  "book-press-here",
  "book-who-did-poo",
  "book-joseph-coat",
]);

const readingListRecords = [
  ["reading-oxford-tree", "牛津阅读树 Oxford Reading Tree", "Roderick Hunt", "分级 L1-9", "分级阅读"],
  ["reading-red-rocket", "红火箭 Red Rocket Readers", "Pam Holden", "分级 入门", "分级阅读"],
  ["reading-pearson-kids", "培生儿童英语分级阅读", "Pearson", "分级", "分级阅读"],
  ["reading-biscuit", "饼干狗 Biscuit", "Alyssa Satin Capucilli", "绘本", "日常与动物"],
  ["reading-fly-guy", "苍蝇小子 Fly Guy", "Tedd Arnold", "桥梁", "幽默故事"],
  ["reading-elephant-piggie", "小猪小象 Elephant & Piggie", "Mo Willems", "绘本", "友谊与对话"],
  ["reading-brown-bear", "棕色的熊 Brown Bear", "Bill Martin Jr.；Eric Carle 绘", "绘本", "颜色与动物"],
  ["reading-very-hungry-caterpillar", "好饿的毛毛虫 The Very Hungry Caterpillar", "Eric Carle", "绘本", "自然与成长"],
  ["reading-liao-caixing", "廖彩杏书单", "廖彩杏", "英文书单", "亲子共读"],
  ["reading-wang-peiting", "汪培珽书单", "汪培珽", "英文书单", "亲子共读"],
  ["reading-wu-minlan", "吴敏兰书单", "吴敏兰", "英文书单", "亲子共读"],
  ["reading-i-can-read", "I Can Read 分级", "HarperCollins", "分级", "分级阅读"],
  ["reading-maisy", "Maisy", "Lucy Cousins", "绘本", "生活与探索"],
  ["reading-peter-rabbit", "Peter Rabbit", "Beatrix Potter", "绘本", "动物与自然"],
  ["reading-frog-toad", "Frog and Toad", "Arnold Lobel", "桥梁", "友谊"],
  ["reading-pete-cat", "Pete the Cat", "James Dean；Eric Litwin", "绘本", "音乐与日常"],
  ["reading-magic-tree-house", "Magic Tree House", "Mary Pope Osborne", "桥梁", "冒险"],
  ["reading-step-into-reading", "Step into Reading", "Random House Children's Books", "分级", "分级阅读"],
  ["reading-scholastic-sight-word", "Scholastic Sight Word Readers", "Scholastic", "入门", "初步阅读"],
  ["reading-bob-books", "Bob Books", "Bobby Lynn Maslen；John R. Maslen", "入门", "自然拼读"],
  ["reading-ladybird-readers", "Ladybird Readers", "Ladybird", "分级", "分级阅读"],
  ["reading-usborne-first-reading", "Usborne First Reading", "Usborne", "分级", "分级阅读"],
  ["reading-national-geographic-kids", "National Geographic Kids Readers", "National Geographic", "分级", "自然与科普"],
  ["reading-hello-reader", "Hello Reader!", "Scholastic", "分级", "分级阅读"],
];

export const LEGACY_READING_LIST_IDS = Object.freeze([
  "reading-oxford-tree", "reading-red-rocket", "reading-pearson-kids", "reading-biscuit",
  "reading-fly-guy", "reading-elephant-piggie", "reading-brown-bear", "reading-very-hungry-caterpillar",
  "reading-liao-caixing", "reading-wang-peiting", "reading-wu-minlan", "reading-i-can-read",
]);
export const READING_LISTS = Object.freeze(readingListRecords.map(([id, t, a, tag, theme]) => Object.freeze({
  id, t, a, tag, theme,
  prompt: "由照护者按孩子的兴趣和当前阅读状态选读，书单级别不是学习要求。",
  sourceRef: "reading-list-curation-original",
  agePackages: ["foundation-v2", "bridging-v1"],
  bibliographicVerification: "not-individually-verified",
})));
