// 客户端 wiki link 预处理。
//
// 把 markdown 源里的 [[target]] / [[target|alias]] 替换为标准 markdown 链接
//   [target](/d/<resolved>)
//
// 解析规则镜像后端 domain/wiki_link::resolve：
//   - target 含 `/` → repo-relative，缺 .md 自动补
//   - 否则裸名：默认归 <src_user>/，缺 .md 自动补
//
// 已知限制：客户端做不到 FS exists 检查，所以不会 fallback 到 shared/——
// 用户写 [[shared/team]] 这种带前缀的没问题；裸名 [[team]] 一律解析成
// <src_user>/team.md。如果实际文件在 shared/，就显示成"orphan 链接"
// （后端 list/exists 判定后再补，留给后续 phase）。
//
// 同样不处理 ``` 围栏代码块——简单全文 replace 会把 code 里的 [[...]] 也吃。
// MVP 接受这点；用户写 wiki link 教学文档时会发现，再补。

const WIKI_RE = /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g;

export function resolveWikiTarget(target: string, srcPath: string): string {
  const t = target.trim();
  const srcUser = srcPath.split('/')[0] || '';

  if (t.includes('/')) {
    return t.endsWith('.md') ? t : `${t}.md`;
  }
  const name = t.endsWith('.md') ? t : `${t}.md`;
  return srcUser ? `${srcUser}/${name}` : `shared/${name}`;
}

/// 注：`/d/` 路径里的非 ASCII 由 react-router 自己处理；不做 encodeURIComponent，
/// 不然链接 hover 显示的 URL 会变成一坨 %XX。后端也接受未编码（见 doc_controller 的
/// regex 路由 + Drogon 自动 URL-decode）。
export function preprocessWikiLinks(content: string, srcPath: string): string {
  return content.replace(WIKI_RE, (_match, target: string, alias?: string) => {
    const resolved = resolveWikiTarget(target, srcPath);
    const display  = (alias?.trim() || target.trim());
    // markdown 链接里的 ] 要 escape，否则解析炸
    const safeDisplay = display.replace(/\]/g, '\\]');
    return `[${safeDisplay}](/d/${resolved})`;
  });
}
