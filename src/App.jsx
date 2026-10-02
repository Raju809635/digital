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
      <h3>Definition</h3><p>{answer.definition}</p>
      <h3>Explanation</h3><p>{answer.explanation}</p>
      <h3>Key points</h3><ul>{answer.keyPoints.map((point, i) => <li key={i}>{point}</li>)}</ul>
      <h3>Conclusion</h3><p>{answer.conclusion}</p>
      <p className="write-hint"><Sparkles size={15}/> Write this structure clearly for full marks.</p>
      <button className="listen-button" onClick={speak}>{speaking ? <Pause size={16}/> : <Volume2 size={16}/>} {speaking ? 'Pause audio' : 'Listen · 2x'}</button>
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

function PaperSheet({ answers, subject, revision = false, sheetRef }) {
  return <div ref={sheetRef} className={`paper-sheet ${revision ? 'revision-sheet' : ''}`}>
    <div className="paper-brand">DIGITAL ORBIT <span>EXAM ANSWER NOTES</span></div>
    <h1>{revision ? 'One-page revision' : subject || 'Exam answers'}</h1>
    {answers.map((answer, index) => <section className="paper-answer" key={index}>
      <h2>Q{index + 1}. {answer.question}</h2>
      {revision ? <p><b>KEYWORDS:</b> {answer.keywords.join(' · ') || answer.keyPoints.join(' · ')}</p> : <>
        <h3>Definition</h3><p>{answer.definition}</p><h3>Explanation</h3><p>{answer.explanation}</p>
        <h3>Key points</h3><ul>{answer.keyPoints.map((point, i) => <li key={i}>{point}</li>)}</ul>
        <h3>Conclusion</h3><p>{answer.conclusion}</p>
      </>}
    </section>)}
  </div>;
}

async function downloadPdf(node, filename, onePage = false) {
  if (!node) throw new Error('The PDF page is not available.');
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const canvas = await html2canvas(node, { scale: 1.5, backgroundColor: '#fff', useCORS: true });
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const width = pdf.internal.pageSize.getWidth(); const height = canvas.height * width / canvas.width;
  const image = canvas.toDataURL('image/jpeg', 0.92);
  if (onePage || height <= pdf.internal.pageSize.getHeight()) pdf.addImage(image, 'JPEG', 0, 0, width, Math.min(height, pdf.internal.pageSize.getHeight()));
  else {
    const pageHeightPx = canvas.width * pdf.internal.pageSize.getHeight() / width;
    let offset = 0;
    while (offset < canvas.height) {
      if (offset) pdf.addPage();
      const slice = document.createElement('canvas'); slice.width = canvas.width; slice.height = Math.min(pageHeightPx, canvas.height - offset);
      slice.getContext('2d').drawImage(canvas, 0, offset, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, width, slice.height * width / canvas.width); offset += pageHeightPx;
    }
  }
  pdf.save(filename);
}

export default function App() {
  const [questions, setQuestions] = useState('');
  const [mode, setMode] = useState('pass');
  const [answers, setAnswers] = useState([]);
  const [subject, setSubject] = useState('');
  const [openIndex, setOpenIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const fileInput = useRef(null); const answersPaper = useRef(null); const revisionPaper = useRef(null);

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
    setPdfBusy(true); setError('');
    try { await document.fonts.ready; await downloadPdf(revision ? revisionPaper.current : answersPaper.current, revision ? 'digital-orbit-revision.pdf' : 'digital-orbit-handwritten-answers.pdf', revision); }
    catch (exportError) { console.error('[pdf-export]', exportError); setError('Could not create the PDF. Please try again.'); }
    finally { setPdfBusy(false); }
  };

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#top">digital orbit <small>by ORIN</small></a><span className="top-label">NIGHT MODE · EXAM ANSWER GENERATOR</span></header>
    <section className="hero" id="top"><div className="hero-tag">YOUR LAST-MINUTE ANSWER SHEET <span>✳</span></div>
      <h1>Upload important questions <em>→</em><br/>Get handwritten exam answers instantly</h1>
      <p>No notes. No wasting time. Only what gets marks.</p>
    </section>
    <section className="input-panel" aria-label="Question input">
      <label htmlFor="questions">Upload important questions</label>
      <p className="field-hint">Paste the questions below, or add a PDF with selectable text.</p>
      <textarea id="questions" value={questions} onChange={e => { setQuestions(e.target.value); setFileName(''); }} placeholder={'Paste one or more questions here…\n\nExample: Explain the OSI reference model.'} maxLength={16000}/>
      <div className="input-actions"><button className="upload-button" onClick={() => fileInput.current?.click()}><Upload size={17}/> Upload PDF</button><input ref={fileInput} type="file" accept="application/pdf,.pdf" onChange={chooseFile} hidden/><span>{fileName || `${questions.length.toLocaleString()} / 16,000`}</span></div>
      <div className="mode-label">CHOOSE YOUR ANSWER STYLE</div>
      <div className="mode-options">{[['pass','Pass Mode','Short, direct answers'],['score','Score Mode','More detail for higher marks']].map(([value,title,desc]) => <button key={value} onClick={() => setMode(value)} className={`mode-option ${mode===value?'active':''}`} aria-pressed={mode===value}><span className="mode-dot"/><span><b>{title}</b><small>{desc}</small></span></button>)}</div>
      <button className="generate-button" onClick={generate} disabled={loading}>{loading ? <><LoaderCircle className="spin" size={18}/> Preparing your answers…</> : <><Sparkles size={18}/> Generate Handwritten Answers</>}</button>
      {error && <p className="error-message" role="alert">{error}</p>}
      <p className="privacy-note">Your answers are prepared securely. Never paste passwords or private information.</p>
    </section>

    {answers.length > 0 && <section className="results" id="results"><div className="results-heading"><div><span className="section-kicker">YOUR EXAM ANSWERS</span><h2>{subject}</h2><p>{answers.length} ready-to-review {answers.length === 1 ? 'answer' : 'answers'}</p></div><FileText size={32}/></div>
      <div className="answers-list">{answers.map((answer, index) => <AnswerItem key={`${index}-${answer.question}`} answer={answer} index={index} expanded={openIndex===index} onToggle={() => setOpenIndex(openIndex===index ? -1 : index)}/>)}</div>
      <div className="download-area"><span className="section-kicker">TAKE YOUR NOTES WITH YOU</span><h2>Ready to write.</h2><p>Notebook-style pages with clear headings and key terms.</p><div className="download-actions"><button className="download-primary" disabled={pdfBusy} onClick={() => exportPdf(false)}><Download size={17}/>{pdfBusy ? 'Creating PDF…' : 'Download Handwritten PDF'}</button><button className="download-secondary" disabled={pdfBusy} onClick={() => exportPdf(true)}><FileText size={17}/>1-Page Revision PDF</button></div></div>
      <div className="export-hidden" aria-hidden="true"><PaperSheet sheetRef={answersPaper} answers={answers} subject={subject}/><PaperSheet sheetRef={revisionPaper} answers={answers} subject={subject} revision/></div>
    </section>}
    {loading && <div className="loading-note"><LoaderCircle className="spin" size={18}/> Turning your questions into scoring answers…</div>}
    <footer>Digital Orbit <span>·</span> Make tonight count.</footer>
  </main>;
}
