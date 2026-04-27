import { useEffect, useRef } from 'react';
import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';

interface Props {
  // 初始内容；mount 后改这个不会重建编辑器（避免输入光标跳动）
  initialContent: string;
  // markdown 变化时触发
  onChange: (markdown: string) => void;
}

/// Milkdown Crepe（Notion-style WYSIWYG）的 React 包装。
/// 命令式生命周期：mount 时 create()，unmount 时 destroy()。
/// 不做受控（受控 = 每次 setValue 都重建文档树，光标会丢）。
/// 父组件想要拿值，靠 onChange 持续推。
export default function Editor({ initialContent, onChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  // 用 ref 持有最新 onChange，避免每次父组件 rerender 都重建编辑器
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current) return;

    const crepe = new Crepe({
      root: hostRef.current,
      defaultValue: initialContent,
    });

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, md) => {
        onChangeRef.current(md);
      });
    });

    crepe.create();
    crepeRef.current = crepe;

    return () => {
      crepe.destroy();
      crepeRef.current = null;
    };
    // 故意不把 initialContent 加到依赖里——切文档时父组件会 key 重置组件
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} className="crepe-host" />;
}
