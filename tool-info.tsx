import React, { useState } from 'react';
import '@/tool-info.css';

interface ToolInfoProps {
  t: Record<string, string>;
  toolKey: 'editor' | 'sprite' | 'converter';
}

/**
 * 도구 페이지(에디터/스프라이트/변환기)의 도움말 패널.
 * 기본은 닫혀 있어 도구 화면을 가리지 않으며, "?" 버튼으로 펼쳐 사용법·기능·FAQ를 본다.
 * 패널 콘텐츠는 열림 여부와 관계없이 항상 DOM에 렌더되므로 검색 크롤러가 텍스트를 읽을 수 있다(SEO).
 */
export const ToolInfo: React.FC<ToolInfoProps> = ({ t, toolKey }) => {
  const [open, setOpen] = useState(false);
  const k = (s: string): string => t[`${toolKey}Info_${s}`] || '';

  const title = k('title');
  if (!title) return null;

  const helpLabel = t.toolInfoHelp || 'Guide';
  const closeLabel = t.close || 'Close';
  const steps = ['step1', 'step2', 'step3', 'step4'].map(k).filter(Boolean);
  const feats = ['feat1', 'feat2', 'feat3', 'feat4'].map(k).filter(Boolean);
  const faqs = [
    { q: k('q1'), a: k('a1') },
    { q: k('q2'), a: k('a2') },
    { q: k('q3'), a: k('a3') },
  ].filter((f) => f.q && f.a);

  const panelId = `tool-info-panel-${toolKey}`;

  return (
    <>
      <button
        type="button"
        className="tool-info-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          {open ? 'close' : 'help'}
        </span>
        <span className="tool-info-toggle-label">{helpLabel}</span>
      </button>

      {open && (
        <div className="tool-info-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      <aside
        id={panelId}
        className={`tool-info-panel${open ? ' open' : ''}`}
        aria-label={title}
        aria-hidden={!open}
      >
        <div className="tool-info-header">
          <h2 className="tool-info-title">{title}</h2>
          <button
            type="button"
            className="tool-info-close"
            onClick={() => setOpen(false)}
            aria-label={closeLabel}
          >
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>

        <div className="tool-info-body">
          <p className="tool-info-intro">{k('intro')}</p>

          {steps.length > 0 && (
            <div className="tool-info-block">
              <h3>{k('howtoTitle')}</h3>
              <ol className="tool-info-steps">
                {steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          )}

          {feats.length > 0 && (
            <div className="tool-info-block">
              <h3>{k('featuresTitle')}</h3>
              <ul className="tool-info-features">
                {feats.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {faqs.length > 0 && (
            <div className="tool-info-block">
              <h3>{k('faqTitle')}</h3>
              <dl className="tool-info-faq">
                {faqs.map((f, i) => (
                  <React.Fragment key={i}>
                    <dt>{f.q}</dt>
                    <dd>{f.a}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
