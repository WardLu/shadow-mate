import fs from 'node:fs';
import path from 'node:path';

function walk(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else if (file.endsWith('.html')) {
      results.push(fullPath);
    }
  }
  return results;
}

let targetDir = process.argv[2];
if (!targetDir) {
  if (fs.existsSync('dist')) {
    targetDir = 'dist';
  } else if (fs.existsSync('.vercel/output/static')) {
    targetDir = '.vercel/output/static';
  } else {
    targetDir = '.';
  }
}
const htmlFiles = walk(targetDir);
const report = [];

if (htmlFiles.length === 0) {
  console.error(`❌ 未在 ${targetDir} 中找到任何 HTML 产物！请先执行 build。`);
  process.exit(1);
}

// 针对 public 路由白名单检测 (/, /privacy)
const CANONICAL_PUBLIC_ROUTES = ['index.html', 'privacy.html'];

for (const file of htmlFiles) {
  const relPath = path.relative(targetDir, file);
  if (relPath.includes('_not-found') || relPath.includes('404.html') || relPath.includes('500.html') || relPath.includes('baidu_verify')) {
    continue;
  }
  // 只审计面向公开索引的核心页面产物
  const fileName = path.basename(file);
  const isPublicCanonical = CANONICAL_PUBLIC_ROUTES.includes(fileName) || CANONICAL_PUBLIC_ROUTES.some(r => relPath.endsWith(r));
  if (!isPublicCanonical) {
    continue;
  }

  const html = fs.readFileSync(file, 'utf-8');

  // 1. Title 检测
  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  const title = titleMatch ? titleMatch[1] : '';

  // 2. Description 检测
  const descMatch =
    html.match(/<meta\s+name="description"\s+content="([^"]*)"/i) ||
    html.match(/<meta\s+content="([^"]*)"\s+name="description"/i);
  const desc = descMatch ? descMatch[1] : '';

  // 3. Headings 检测
  const h1s = (html.match(/<h1\b[^>]*>/gi) || []).length;
  const h2s = (html.match(/<h2\b[^>]*>/gi) || []).length;
  const h3s = (html.match(/<h3\b[^>]*>/gi) || []).length;

  // 4. 图片检测
  const imgMatches = html.match(/<img\b[^>]*>/gi) || [];
  let imgWithoutAlt = 0;
  let imgWithoutTitle = 0;
  for (const tag of imgMatches) {
    if (!/\balt\s*=/i.test(tag)) imgWithoutAlt++;
    if (!/\btitle\s*=/i.test(tag)) imgWithoutTitle++;
  }

  // 5. 链接检测
  const aMatches = html.match(/<a\b[^>]*>/gi) || [];
  let aWithoutTitle = 0;
  for (const tag of aMatches) {
    if (/\bhref\s*=/i.test(tag) && !/\btitle\s*=/i.test(tag)) {
      aWithoutTitle++;
    }
  }

  const issues = [];
  if (title.length < 30 || title.length > 60) {
    issues.push(`Title 长度不达标: ${title.length} 字符 ("${title}") [要求 30-60]`);
  }
  if (desc.length < 140 || desc.length > 160) {
    issues.push(`Description 长度不达标: ${desc.length} 字符 ("${desc}") [要求 140-160]`);
  }
  if (title.includes('&amp;') || title.includes('&')) {
    issues.push('Title 包含 & / &amp; 转义实体');
  }
  if (desc.includes('&amp;') || desc.includes('&')) {
    issues.push('Description 包含 & / &amp; 转义实体');
  }
  if (h1s !== 1) {
    issues.push(`H1 标签数量异常: ${h1s} [要求 1]`);
  }
  if (h2s < 2) {
    issues.push(`H2 标签不足: ${h2s} [要求 ≥2]`);
  }
  if (h3s < 2) {
    issues.push(`H3 标签不足: ${h3s} [要求 ≥2]`);
  }
  if (imgWithoutAlt > 0) {
    issues.push(`缺少 alt 图片: ${imgWithoutAlt}`);
  }
  if (imgWithoutTitle > 0) {
    issues.push(`缺少 title 图片: ${imgWithoutTitle}`);
  }
  if (aWithoutTitle > 0) {
    issues.push(`缺少 title 链接: ${aWithoutTitle}`);
  }

  if (issues.length > 0) {
    report.push({ file: relPath, issues, details: { titleLen: title.length, descLen: desc.length, h1s, h2s, h3s } });
  }
}

if (report.length > 0) {
  console.error('❌ AITDK 离线审计发现未合规页面:\n', JSON.stringify(report, null, 2));
  process.exit(1);
} else {
  console.log(`✅ AITDK 离线产物全量审计通过！扫描 ${htmlFiles.length} 个页面，公开核心页面全部 100% 合规！`);
}
