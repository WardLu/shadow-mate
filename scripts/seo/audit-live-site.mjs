import https from 'node:https';

const BASE_URL = process.env.SITE_URL || 'https://sm.shadow.wang';
const ROUTES = ['/', '/privacy'];

async function fetchRoute(route) {
  return new Promise((resolve, reject) => {
    https.get(`${BASE_URL}${route}`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, html: data }));
    }).on('error', reject);
  });
}

async function run() {
  console.log(`🌐 开始对 ${BASE_URL} 执行线上 AITDK 实时审计...`);
  let hasErrors = false;

  for (const route of ROUTES) {
    const { statusCode, html } = await fetchRoute(route);
    if (statusCode !== 200) {
      console.error(`❌ [${route}] HTTP 状态码非 200: ${statusCode}`);
      hasErrors = true;
      continue;
    }

    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    const title = titleMatch ? titleMatch[1] : '';

    const descMatch =
      html.match(/<meta\s+name="description"\s+content="([^"]*)"/i) ||
      html.match(/<meta\s+content="([^"]*)"\s+name="description"/i);
    const desc = descMatch ? descMatch[1] : '';

    const issues = [];
    if (title.length < 30 || title.length > 60) {
      issues.push(`Title 长度不合规: ${title.length} 字符 ("${title}") [要求 30-60]`);
    }
    if (desc.length < 140 || desc.length > 160) {
      issues.push(`Description 长度不合规: ${desc.length} 字符 ("${desc}") [要求 140-160]`);
    }
    if (title.includes('&amp;') || title.includes('&')) {
      issues.push('Title 包含 & / &amp; 实体');
    }
    if (desc.includes('&amp;') || desc.includes('&')) {
      issues.push('Description 包含 & / &amp; 实体');
    }

    if (issues.length > 0) {
      hasErrors = true;
      console.error(`❌ [${route}] 发现问题:`, issues);
    } else {
      console.log(`✅ [${route}] 通过! Title(${title.length}字): "${title}" | Desc(${desc.length}字): "${desc.slice(0, 30)}..."`);
    }
  }

  if (hasErrors) {
    console.error('❌ 线上 AITDK 审计未完全通过！');
    process.exit(1);
  } else {
    console.log(`🎉 ${BASE_URL} 线上端点 AITDK 审计全部 100% 满分通过！`);
  }
}

run().catch((err) => {
  console.error('执行出错:', err);
  process.exit(1);
});
