import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HELP } from '../lib/help';
import { Empty, Header } from '../components/ui';
import { Icon } from '../components/Icon';

/** Renders **bold** inside a help step. */
function rich(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
}

/** "How do I…" guide. Every screen's ? button opens it at that screen's topic. */
export function Help() {
  const [params] = useSearchParams();
  const topic = params.get('topic');
  const [q, setQ] = useState('');
  useEffect(() => {
    if (topic) document.getElementById(`help-${topic}`)?.scrollIntoView({ block: 'start' });
  }, [topic]);

  const term = q.trim().toLowerCase();
  const sections = HELP.map((s) => ({
    ...s,
    topics: s.topics.filter((t) => !term || t.q.toLowerCase().includes(term) || t.steps.some((x) => x.toLowerCase().includes(term))),
  })).filter((s) => s.topics.length);

  return (
    <div className="page help">
      <Header title="Help" sub="How do I…" back />
      <label className="search">
        <Icon name="search" size={16} />
        <span className="sr">Search help</span>
        <input type="search" placeholder="Search, e.g. receipt, waiver, program" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {sections.length === 0 && <Empty>Nothing matches "{q}". Try another word, or contact Chris.</Empty>}
      {sections.map((s) => (
        <section className="section" key={s.title}>
          <div className="section-head"><h2>{s.title}</h2></div>
          <div className="card">
            {s.topics.map((t) => (
              <details key={t.id} id={`help-${t.id}`} className="help-item" open={t.id === topic || !!term}>
                <summary><span>{t.q}</span><Icon name="chevron" size={16} /></summary>
                <ol>{t.steps.map((step, i) => <li key={i}>{rich(step)}</li>)}</ol>
                {t.tip && <p className="help-tip">{rich(t.tip)}</p>}
              </details>
            ))}
          </div>
        </section>
      ))}
      <p className="small center">Still stuck? Contact Chris at SolanoOps.</p>
    </div>
  );
}
