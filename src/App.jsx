import { useRef, useState } from 'react';
import { ChevronDown, FileText, LoaderCircle, Play, Pause, Upload, Download, Sparkles, Volume2 } from 'lucide-react';

function AnswerItem({ answer, index, expanded, onToggle }) {
  const [speaking, setSpeaking] = useState(false);
  const speak = () => {
    if (!('speechSynthesis' in window)) return;
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    window.speechSynthesis.cancel();
    const text = [answer.question, answer.definition, answer.explanation, ...answer.keyPoints, answer.conclusion].filter(Boolean).join('. ');
    const utterance = new SpeechSynthesisUtterance(text); utterance.rate = 2;
    utterance.onend = () => setSpeaking(false); utterance.onerror = () => setSpeaking(false);
    setSpeaking(true); window.speechSynthesis.speak(utterance);
  };
  return <article className="answer-item">
    <button className="answer-toggle" onClick={onToggle} aria-expanded={expanded}>
      <span><small>QUESTION {String(index + 1).padStart(2, '0')}</small>{answer.question}</span><ChevronDown className={expanded ? 'turned' : ''} size={20}/>
    </button>
    {expanded && <div className="answer-body">
      {answer.isMath ? <>
        <h3>Worked solution</h3><p className="solution-text">{answer.explanation}</p>
        {answer.conclusion && <><h3>Final answer</h3><p className="solution-text">{answer.conclusion}</p></>}
      </> : <>
        <h3>Definition</h3><p>{answer.definition}</p>
        <h3>Explanation</h3><p>{answer.explanation}</p>
        <h3>Key points</h3><ul>{answer.keyPoints.map((point, i) => <li key={i}>{point}</li>)}</ul>
        {answer.diagram && !/^not needed\.?$/i.test(answer.diagram.trim()) && <><h3>Diagram</h3><p className="diagram-placeholder">{answer.diagram}</p></>}
        <h3>Conclusion</h3><p>{answer.conclusion}</p>
        {!!answer.keywords?.length && <><h3>Keywords</h3><p className="keywords">{answer.keywords.map(word => word.toLocaleUpperCase()).join(' · ')}</p></>}
        <p className="write-hint"><Sparkles size={15}/> Write this structure clearly for full marks.</p>
      </>}      <button className="listen-button" onClick={speak}>{speaking ? <Pause size={16}/> : <Volume2 size={16}/>} {speaking ? 'Pause audio' : 'Listen Â· 2x'}</button>
    </div>}
  </article>;
}

async function readPdf(file) {
  if (file.size > 12 * 1024 * 1024) throw new Error('That PDF is over 12 MB. Try a smaller file.');
  const [pdfjs, { default: workerUrl }] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  if (doc.numPages > 30) throw new Error('Please upload a PDF with 30 pages or fewer.');
  let text = '';
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n); const content = await page.getTextContent();
    text += `${content.items.map(item => item.str).join(' ')}\n`;
  }
  if (!text.trim()) throw new Error('This PDF has no selectable text. Paste the questions instead.');
  return text.slice(0, 16000);
}

async function downloadPdf({ title, answers, revision }) {
  const response = await fetch('/api/generate-pdf', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, answers, revision }), signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) {
    const raw = await response.text();
    let payload = {};
    try { payload = JSON.parse(raw); } catch { payload.error = raw.slice(0, 180); }
    const detail = [payload.details, payload.diagnostic].filter(Boolean).join(' Â· ');
    throw new Error([payload.error || `PDF service error (${response.status})`, detail].filter(Boolean).join(' â€” '));
  }
  if (!response.headers.get('content-type')?.includes('application/pdf')) throw new Error('The server did not return a PDF. Please try again.');
  const blob = await response.blob();
  if (!blob.size) throw new Error('The generated PDF is empty. Please try again.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url;
  link.download = revision ? 'digital-orbit-revision.pdf' : 'digital-orbit-handwritten-answers.pdf';
  document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function App() {
  const [questions, setQuestions] = useState('');
  const [mode, setMode] = useState('pass');
  const [answers, setAnswers] = useState([]);
  const [subject, setSubject] = useState('');
  const [openIndex, setOpenIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const fileInput = useRef(null);

  const chooseFile = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    setError('');
    try { setQuestions(await readPdf(file)); setFileName(file.name); }
    catch (e) { setError(e.message || 'Could not read that PDF.'); }
    event.target.value = '';
  };

  const generate = async () => {
    if (!questions.trim()) { setError('Paste your questions or upload a PDF to get started.'); return; }
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/generate-answers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ questions: questions.trim(), mode }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not prepare answers. Try again.');
      setSubject(payload.subject || 'Exam answers'); setAnswers(payload.answers || []); setOpenIndex(0);
      setTimeout(() => document.querySelector('#results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (e) { setError(e.message || 'Could not prepare answers. Try again.'); }
    finally { setLoading(false); }
  };

  const exportPdf = async revision => {
    if (!answers.length) return;
    setPdfBusy(true); setPdfError('');
    try { await downloadPdf({ title: subject, answers, revision }); }
    catch (exportError) { console.error('[pdf-export]', exportError); setPdfError(exportError.name === 'TimeoutError' ? 'PDF generation took too long. Please try again.' : exportError.message || 'Could not create the PDF. Please try again.'); }
    finally { setPdfBusy(false); }
  };

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#top">digital orbit <small>by ORIN</small></a><span className="top-label">NIGHT MODE Â· EXAM ANSWER GENERATOR</span></header>
    <section className="hero" id="top"><div className="hero-tag">YOUR LAST-MINUTE ANSWER SHEET <span>âœ³</span></div>
      <h1>Upload important questions <em>â†’</em><br/>Get handwritten exam answers instantly</h1>
      <p>No notes. No wasting time. Only what gets marks.</p>
    </section>
    <section className="input-panel" aria-label="Question input">
      <label htmlFor="questions">Upload important questions</label>
      <p className="field-hint">Paste the questions below, or add a PDF with selectable text.</p>
      <textarea id="questions" value={questions} onChange={e => { setQuestions(e.target.value); setFileName(''); }} placeholder={'Paste one or more questions hereâ€¦\n\nExample: Explain the OSI reference model.'} maxLength={16000}/>
      <div className="input-actions"><button className="upload-button" onClick={() => fileInput.current?.click()}><Upload size={17}/> Upload PDF</button><input ref={fileInput} type="file" accept="application/pdf,.pdf" onChange={chooseFile} hidden/><span>{fileName || `${questions.length.toLocaleString()} / 16,000`}</span></div>
      <div className="mode-label">CHOOSE YOUR ANSWER STYLE</div>
      <div className="mode-options">{[['pass','Pass Mode','Short, direct answers'],['score','Score Mode','More detail for higher marks']].map(([value,title,desc]) => <button key={value} onClick={() => setMode(value)} className={`mode-option ${mode===value?'active':''}`} aria-pressed={mode===value}><span className="mode-dot"/><span><b>{title}</b><small>{desc}</small></span></button>)}</div>
      <button className="generate-button" onClick={generate} disabled={loading}>{loading ? <><LoaderCircle className="spin" size={18}/> Preparing your answersâ€¦</> : <><Sparkles size={18}/> Generate Handwritten Answers</>}</button>
      {error && <p className="error-message" role="alert">{error}</p>}
      <p className="privacy-note">Your answers are prepared securely. Never paste passwords or private information.</p>
    </section>

    {answers.length > 0 && <section className="results" id="results"><div className="results-heading"><div><span className="section-kicker">YOUR EXAM ANSWERS</span><h2>{subject}</h2><p>{answers.length} ready-to-review {answers.length === 1 ? 'answer' : 'answers'}</p></div><FileText size={32}/></div>
      <div className="answers-list">{answers.map((answer, index) => <AnswerItem key={`${index}-${answer.question}`} answer={answer} index={index} expanded={openIndex===index} onToggle={() => setOpenIndex(openIndex===index ? -1 : index)}/>)}</div>
      <div className="download-area"><span className="section-kicker">TAKE YOUR NOTES WITH YOU</span><h2>Ready to write.</h2><p>Notebook-style pages with clear headings and key terms.</p><div className="download-actions"><button className="download-primary" disabled={pdfBusy} onClick={() => exportPdf(false)}><Download size={17}/>{pdfBusy ? 'Creating PDFâ€¦' : 'Download Handwritten PDF'}</button><button className="download-secondary" disabled={pdfBusy} onClick={() => exportPdf(true)}><FileText size={17}/>{pdfBusy ? 'Creating PDFâ€¦' : '1-Page Revision PDF'}</button></div>{pdfError && <p className="error-message pdf-error" role="alert">{pdfError}</p>}</div>
    </section>}
    {loading && <div className="loading-note"><LoaderCircle className="spin" size={18}/> Turning your questions into scoring answersâ€¦</div>}
    <footer>Digital Orbit <span>Â·</span> Make tonight count.</footer>
  </main>;
}
