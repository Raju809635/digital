import { useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { ChevronDown, FileText, LoaderCircle, Play, Pause, Upload, Download, Sparkles, Volume2 } from 'lucide-react';
import { countExamQuestions } from '../lib/format.js';
import { trackEvent } from './analytics.js';
import AdSenseUnit from './AdSenseUnit.jsx';

function AnswerItem({ answer, index, expanded, onToggle, videoNotes = false }) {
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
      <span><small>{videoNotes ? 'VIDEO NOTES' : `QUESTION ${String(index + 1).padStart(2, '0')}`}</small>{answer.question}</span><ChevronDown className={expanded ? 'turned' : ''} size={20}/>
    </button>
    {expanded && <div className={`answer-body${answer.isMath ? ' math-answer' : ''}`}>
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
      </>}
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
    const rows = [];
    const items = content.items.filter(item => item.str?.trim())
      .map(item => ({ x: item.transform?.[4] || 0, y: item.transform?.[5] || 0, width: item.width || 0, text: item.str }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    const pageWidth = (page.view?.[2] || 600) - (page.view?.[0] || 0);
    for (const item of items) {
      let row = rows[rows.length - 1];
      if (!row || Math.abs(row.y - item.y) >= 2.5) { row = { y: item.y, items: [] }; rows.push(row); }
      row.items.push(item);
    }
    text += rows.flatMap(row => {
      const sorted = row.items.sort((a, b) => a.x - b.x);
      const columns = [[]];
      for (const item of sorted) {
        const current = columns[columns.length - 1];
        const previous = current[current.length - 1];
        const previousRight = previous ? previous.x + (previous.width || 0) : 0;
        if (previous && item.x - previousRight > pageWidth * 0.085) columns.push([]);
        columns[columns.length - 1].push(item);
      }
      return columns.map(column => column.map(item => item.text.trim()).filter(Boolean).join(' ').replace(/[ \t]{2,}/g, ' '));
    }).filter(line => line && !/^\d{1,3}$/.test(line.trim())).join('\n') + '\n\n';
  }
  if (!text.trim()) throw new Error('This looks like a scanned PDF with no selectable text. Save an OCR/searchable copy or paste the questions manually.');
  if (text.length > 16000) throw new Error('This PDF contains too much text to extract accurately. Upload a smaller section or paste up to 5 questions.');
  return text;
}

async function downloadPdf({ title, answers, revision, videoNotes }) {
  const response = await fetch('/api/generate-pdf', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, answers, revision, videoNotes }), signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) {
    const raw = await response.text();
    let payload = {};
    try { payload = JSON.parse(raw); } catch { payload.error = raw.slice(0, 180); }
    const detail = [payload.details, payload.diagnostic].filter(Boolean).join(' · ');
    throw new Error([payload.error || `PDF service error (${response.status})`, detail].filter(Boolean).join(' — '));
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
  const [sourceType, setSourceType] = useState('questions');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaProgress, setMediaProgress] = useState(0);
  const [loadingLabel, setLoadingLabel] = useState('');
  const [resultSource, setResultSource] = useState('questions');
  const [resultNotice, setResultNotice] = useState('');
  const [mode, setMode] = useState('5');
  const [answers, setAnswers] = useState([]);
  const [subject, setSubject] = useState('');
  const [openIndex, setOpenIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const fileInput = useRef(null);
  const mediaInput = useRef(null);
  const questionCount = countExamQuestions(questions);

  const chooseFile = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    setError('');
    try { setQuestions(await readPdf(file)); setFileName(file.name); trackEvent('questions_pdf_uploaded'); }
    catch (e) { setError(e.message || 'Could not read that PDF.'); }
    event.target.value = '';
  };

  const chooseMedia = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    const accepted = ['audio/flac', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/x-flac', 'audio/x-wav', 'video/mp4', 'video/webm', 'video/mpeg'];
    if (!accepted.includes(file.type.toLowerCase())) setError('Choose an MP3, M4A, WAV, OGG, FLAC, WebM, or MP4 file.');
    else if (file.size > 25 * 1024 * 1024) setError('Audio and video uploads must be 25 MB or smaller.');
    else setMediaFile(file);
    event.target.value = '';
  };

  const generate = async () => {
    if (sourceType === 'questions' && !questions.trim()) { setError('Paste your questions or upload a PDF to get started.'); return; }
    if (sourceType === 'youtube' && !youtubeUrl.trim()) { setError('Paste a YouTube video link first.'); return; }
    if (sourceType === 'media' && !mediaFile) { setError('Choose an audio or video file first.'); return; }
    if (sourceType === 'questions' && questionCount > 5) { setError('This looks like ' + questionCount + ' questions. Please keep each batch to 5 or fewer for better answers.'); return; }
    setLoading(true); setError(''); setResultNotice(''); setMediaProgress(0);
    try {
      const isYoutube = sourceType === 'youtube';
      const isMedia = sourceType === 'media';
      let requestUrl = isYoutube ? '/api/youtube-notes' : '/api/generate-answers';
      let requestBody = isYoutube ? { url: youtubeUrl.trim(), mode } : { questions: questions.trim(), mode };
      if (isMedia) {
        setLoadingLabel('Uploading your file…');
        const ext = mediaFile.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'media';
        const blob = await upload(`digital-orbit-media/${crypto.randomUUID()}.${ext}`, mediaFile, {
          access: 'private', handleUploadUrl: '/api/upload-media', maximumSizeInBytes: 25 * 1024 * 1024,
          onUploadProgress: event => setMediaProgress(Math.round(event.percentage))
        });
        setLoadingLabel('Transcribing speech and making notes…');
        requestUrl = '/api/transcribe-media';
        requestBody = { pathname: blob.pathname, mode };
      } else setLoadingLabel(isYoutube ? 'Reading video captions…' : 'Preparing your answers…');
      const response = await fetch(requestUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(requestBody), signal: AbortSignal.timeout(58_000) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not prepare answers. Try again.');
      setSubject(payload.subject || (isMedia || isYoutube ? 'Video study notes' : 'Exam answers')); setAnswers(payload.answers || []); setResultSource(isMedia ? 'media' : isYoutube ? 'youtube' : 'questions'); setOpenIndex(0);
      trackEvent(isMedia ? 'media_notes_generated' : isYoutube ? 'youtube_notes_generated' : 'answers_generated', { marks_mode: mode, answer_count: payload.answers?.length || 0 });
      setResultNotice(payload.truncated ? 'The transcript was long, so notes use the first part.' : '');
      setTimeout(() => document.querySelector('#results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (e) { setError(e.message || 'Could not prepare answers. Try again.'); }
    finally { setLoading(false); setLoadingLabel(''); }
  };

  const exportPdf = async revision => {
    if (!answers.length) return;
    setPdfBusy(true); setPdfError('');
    try { await downloadPdf({ title: subject, answers, revision, videoNotes: resultSource === 'youtube' }); trackEvent(revision ? 'revision_pdf_downloaded' : 'answers_pdf_downloaded'); }
    catch (exportError) { console.error('[pdf-export]', exportError); setPdfError(exportError.name === 'TimeoutError' ? 'PDF generation took too long. Please try again.' : exportError.message || 'Could not create the PDF. Please try again.'); }
    finally { setPdfBusy(false); }
  };

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#top">digital orbit <small>by ORIN</small></a><span className="top-label">EXAM ANSWER GENERATOR</span></header>
    <section className="hero" id="top"><div className="hero-tag">YOUR LAST-MINUTE ANSWER SHEET <span>✳</span></div>
      <h1>Upload important questions <em>→</em><br/>Get handwritten exam answers instantly</h1>
      <p>No notes. No wasting time. Only what gets marks.</p>
    </section>
    <section className="input-panel" aria-label="Question input">
      <div className="source-switch" role="tablist" aria-label="Choose your source">
        <button type="button" role="tab" aria-selected={sourceType === 'questions'} className={sourceType === 'questions' ? 'selected' : ''} onClick={() => { setSourceType('questions'); setError(''); }}>Questions / PDF</button>
        <button type="button" role="tab" aria-selected={sourceType === 'youtube'} className={sourceType === 'youtube' ? 'selected' : ''} onClick={() => { setSourceType('youtube'); setError(''); }}>YouTube video</button>
        <button type="button" role="tab" aria-selected={sourceType === 'media'} className={sourceType === 'media' ? 'selected' : ''} onClick={() => { setSourceType('media'); setError(''); }}>Audio / Video</button>
      </div>
      {sourceType === 'questions' ? <>
        <label htmlFor="questions">Upload important questions</label>
        <p className="field-hint">Paste up to 5 questions, one per line or numbered, or upload a PDF with selectable text.</p>
        <textarea id="questions" value={questions} onChange={e => { setQuestions(e.target.value); setFileName(''); }} placeholder={'Paste one or more questions here…\n\nExample: Explain the OSI reference model.'} maxLength={16000}/>
        <div className="input-actions"><button className="upload-button" onClick={() => fileInput.current?.click()}><Upload size={17}/> Upload PDF</button><input ref={fileInput} type="file" accept="application/pdf,.pdf" onChange={chooseFile} hidden/><span>{fileName ? `${fileName} · ${questionCount} questions extracted` : `${questionCount} / 5 questions · ${questions.length.toLocaleString()} / 16,000 characters`}</span></div>
      </> : sourceType === 'youtube' ? <>
        <label htmlFor="youtube-url">Turn a YouTube lesson into notes</label>
        <p className="field-hint">Paste a public video link. It needs captions or a transcript to be available.</p>
        <input className="youtube-input" id="youtube-url" type="url" value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" autoComplete="url" />
        <p className="youtube-hint">We use the video captions to make your study notes. Private videos and videos without captions won’t work.</p>
      </> : <>
        <label htmlFor="lesson-media">Upload lesson audio or video</label>
        <p className="field-hint">Captions aren’t needed. We transcribe the spoken audio in your file.</p>
        <input ref={mediaInput} id="lesson-media" type="file" accept="audio/flac,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,audio/x-flac,audio/x-wav,video/mp4,video/webm,video/mpeg,.mp3,.m4a,.wav,.ogg,.webm,.mp4,.mpeg" onChange={chooseMedia} hidden />
        <div className="media-picker">
          <button type="button" className="upload-button" onClick={() => mediaInput.current?.click()}><Upload size={17}/>{mediaFile ? 'Choose a different file' : 'Choose audio or video'}</button>
          <span>{mediaFile ? `${mediaFile.name} · ${(mediaFile.size / (1024 * 1024)).toFixed(1)} MB` : 'MP3, M4A, WAV, OGG, FLAC, WebM, or MP4 · up to 25 MB'}</span>
        </div>
        {loading && mediaProgress > 0 && mediaProgress < 100 && <div className="upload-progress"><span style={{ width: `${mediaProgress}%` }}/></div>}
        <p className="youtube-hint">Your file is stored privately only while it is transcribed, then deleted.</p>
      </>}
      <div className="mode-label">CHOOSE YOUR ANSWER STYLE</div>
      <div className="mode-options">{[['5','5 Marks','Focused answer, key steps and examples'],['10','10 Marks','Full explanation, about 2-3 handwritten pages']].map(([value,title,desc]) => <button key={value} onClick={() => setMode(value)} className={`mode-option ${mode===value?'active':''}`} aria-pressed={mode===value}><span className="mode-dot"/><span><b>{title}</b><small>{desc}</small></span></button>)}</div>
      <button className="generate-button" onClick={generate} disabled={loading}>{loading ? <><LoaderCircle className="spin" size={18}/> {loadingLabel}{sourceType === 'media' && mediaProgress > 0 && mediaProgress < 100 ? ` ${mediaProgress}%` : ''}</> : <><Sparkles size={18}/> {sourceType === 'media' ? 'Transcribe & Make Notes' : sourceType === 'youtube' ? 'Generate Video Notes' : 'Generate Handwritten Answers'}</>}</button>
      {error && <p className="error-message" role="alert">{error}</p>}
      <p className="privacy-note">Your answers are prepared securely. Never paste passwords or private information.</p>
    </section>

    {answers.length > 0 && <section className="results" id="results"><div className="results-heading"><div><span className="section-kicker">{resultSource === 'questions' ? 'YOUR EXAM ANSWERS' : 'YOUR VIDEO STUDY NOTES'}</span><h2>{subject}</h2><p>{resultSource === 'media' ? 'Notes prepared from the uploaded file’s audio' : resultSource === 'youtube' ? 'Notes prepared from the video captions' : `${answers.length} ready-to-review ${answers.length === 1 ? 'answer' : 'answers'}`}</p></div><FileText size={32}/></div>
      {resultNotice && <p className="video-notice">{resultNotice}</p>}
      <div className="answers-list">{answers.map((answer, index) => <AnswerItem key={`${index}-${answer.question}`} answer={answer} index={index} expanded={openIndex===index} onToggle={() => setOpenIndex(openIndex===index ? -1 : index)} videoNotes={resultSource !== 'questions'}/>)}</div>
      <div className="download-area"><span className="section-kicker">TAKE YOUR NOTES WITH YOU</span><h2>Ready to write.</h2><p>Notebook-style pages with clear headings and key terms.</p><div className="download-actions"><button className="download-primary" disabled={pdfBusy} onClick={() => exportPdf(false)}><Download size={17}/>{pdfBusy ? 'Creating PDF…' : 'Download Handwritten PDF'}</button><button className="download-secondary" disabled={pdfBusy} onClick={() => exportPdf(true)}><FileText size={17}/>{pdfBusy ? 'Creating PDF…' : '1-Page Revision PDF'}</button></div>{pdfError && <p className="error-message pdf-error" role="alert">{pdfError}</p>}</div>
    </section>}
    {loading && <div className="loading-note"><LoaderCircle className="spin" size={18}/> {loadingLabel || 'Preparing your study notes…'}</div>}
    <AdSenseUnit />
    <footer>Digital Orbit <span>·</span> Make tonight count.</footer>
  </main>;
}
