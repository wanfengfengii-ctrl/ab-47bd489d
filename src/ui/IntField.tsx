import { useEffect, useState } from 'react';

interface IntFieldProps {
  value: number;
  onCommit: (v: number) => void;
  /** 非法输入（空串 / - ）时显示的占位提示 */
  placeholder?: string;
  ariaLabel?: string;
  invalid?: boolean;
}

/**
 * 受控整数字段：编辑过程中允许空串或“-”等中间态（不失焦不跳变），
 * 合法整数即时提交，使上层草稿立即标记为“已修改、认证失效”。
 */
export function IntField({ value, onCommit, placeholder, ariaLabel, invalid }: IntFieldProps) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  return (
    <input
      className={invalid ? 'int-input invalid' : 'int-input'}
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setText(String(value));
      }}
      onChange={(e) => {
        const raw = e.target.value.trim();
        setText(raw);
        if (raw === '' || raw === '-' || raw === '+') {
          onCommit(0);
          return;
        }
        if (/^[+-]?\d+$/.test(raw)) {
          onCommit(parseInt(raw, 10));
        }
      }}
    />
  );
}
