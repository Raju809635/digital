import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { jsPDF } from 'jspdf';
import { ArrowDown, ArrowRight, AudioLines, BookOpen, Check, ChevronDown, CircleHelp, Clock3, Download, Headphones, Lightbulb, Menu, Pause, Play, Plus, Share2, Sparkles, Volume2, X } from 'lucide-react';

const initialAnswers = [
  { id: 'osi', num: '01', q: 'Explain the OSI reference model.', tag: '8 marks · very likely', intro: 'The OSI model is a conceptual framework that explains how data travels between two devices over a network. It divides communication into seven independent layers.', points: ['Application — user-facing network services', 'Presentation — data format, encryption & compression', 'Session — starts, manages and ends connections', 'Transport — reliable delivery, flow control (TCP/UDP)', 'Network — logical addressing and routing (IP)', 'Data Link — frames, MAC addresses and error detection', 'Physical — sends raw bits over the transmission medium'], tip: 'Draw the 7-layer stack. One clean diagram can earn easy marks.' },
  { id: 'deadlock', num: '02', q: 'What is a deadlock? Explain its necessary conditions.', tag: '8 marks · likely', intro: 'A deadlock is a state in which a group of processes are permanently blocked because each process is holding a resource and waiting for another resource held by another process.', points: ['Mutual exclusion — a resource is held by only one process at a time', 'Hold and wait — a process holds resources while requesting more', 'No preemption — resources cannot be forcibly taken away', 'Circular wait — processes form a circular chain of resource requests'], tip: 'Write all four Coffman conditions. Missing even one costs marks.' },
];
const initialTopics = [{ name: 'OSI Model', pct: 85, reason: 'Comes up almost every year', icon: '↗', color: 'lime' }, { name: 'Deadlock', pct: 78, reason: 'Easy marks if you know the 4', icon: 'ϟ', color: 'orange' }, { name: 'CPU Scheduling', pct: 62, reason: 'Know the core algorithm', icon: '↗', color: 'blue' }];
const initialQuiz = [{ question: 'Name the layer that handles logical addressing and routing.', expected: 'The Network layer handles logical addressing and routing.', feedback: 'You missed keyword “Network layer” → about 2 marks.' }, { question: 'How many layers are in the OSI model?', expected: 'There are seven layers in the OSI model.', feedback: 'You missed keyword “Seven layers” → about 2 marks.' }];
const initialMemory = [{ label: 'NETWORKS / 01', title: 'OSI = 7 layers', note: '“Please Do Not Throw Sausage Pizza Away”' }, { label: 'OPERATING SYSTEMS / 02', title: 'Deadlock = 4 conditions', note: 'M · H · N · C — learn the names, explain one line each' }, { label: 'NETWORKS / 03', title: 'TCP is the reliable one.', note: 'Like a registered letter. UDP just sends it.' }];
const initialPanic = [{ title: 'OSI Model', note: 'Read the answer · draw the layers once', minutes: 30 }, { title: 'Stand up. Water. Breathe.', note: 'Seriously. Ten minutes off screen.', minutes: 10 }, { title: 'Deadlock conditions', note: 'Four conditions · one mini self-test', minutes: 30 }, { title: 'Listen to the audio capsule', note: 'Eyes closed counts as studying here.', minutes: 10 }];

function SectionHead({ eyebrow, title, side }) { return <div className="section-head"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{side}</div>; }
function App() {
  const [goal, setGoal] = useState('pass');
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [loadedSubject, setLoadedSubject] = useState('Computer Networks');
  const [answers, setAnswers] = useState(initialAnswers);
  const [topics, setTopics] = useState(initialTopics);
  const [studyOrder, setStudyOrder] = useState('OSI → Deadlock → Scheduling');
  const [quizItems, setQuizItems] = useState(initialQuiz);
  const [memoryItems, setMemoryItems] = useState(initialMemory);
  const [panicItems, setPanicItems] = useState(initialPanic);
  const [confidence, setConfidence] = useState(64);
  const [weakArea, setWeakArea] = useState('Unit 4 · Scheduling');
  const [audioSummary, setAudioSummary] = useState('Remember the OSI layers in order: Physical, Data Link, Network, Transport, Session, Presentation and Application. Deadlock needs four conditions: mutual exclusion, hold and wait, no preemption and circular wait. Write the definition first, list the points clearly, and add a diagram when it helps.');
  const [expanded, setExpanded] = useState('osi');
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState('1x');
  const [quizAnswer, setQuizAnswer] = useState('');
  const [quizChecked, setQuizChecked] = useState(false);
  const [activeNav, setActiveNav] = useState('plan');
  const [toast, setToast] = useState('');
  const [quizIndex, setQuizIndex] = useState(0);
  const [checkingAnswer, setCheckingAnswer] = useState(false);
  const [quizFeedback, setQuizFeedback] = useState('');
  const [apiConfigured, setApiConfigured] = useState(false);
  const answerRefs = useRef({});

  useEffect(() => {
    if (!loading) return undefined;
    const timer = window.setInterval(() => setLoadingStep(step => (step + 1) % 3), 520);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) setActiveNav(e.target.id); }), { threshold: .3 });
    ['plan', 'answers', 'audio', 'test'].forEach(id => { const el = document.getElementById(id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, []);

  useEffect(() => { fetch('/api/health').then(r => r.json()).then(data => setApiConfigured(Boolean(data.configured))).catch(() => setApiConfigured(false)); }, []);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return undefined;
    window.speechSynthesis.cancel();
    if (playing) {
      const utterance = new SpeechSynthesisUtterance(audioSummary);
      utterance.rate = Number.parseFloat(speed) || 1;
      utterance.onend = () => setPlaying(false);
      window.speechSynthesis.speak(utterance);
    }
    return () => window.speechSynthesis.cancel();
  }, [playing, speed, audioSummary]);

  const flash = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2600); };
  const generate = async () => {
    if (!topic.trim()) { document.querySelector('#topic-input')?.focus(); flash('Drop in a subject or question first 👇'); return; }
    setLoading(true);
    try {
      const response = await fetch('/api/study-plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ topic: topic.trim(), goal }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not build the plan.');
      setLoadedSubject(payload.subject || topic.trim());
      setTopics(payload.topics.map((item, index) => ({ name: item.name, pct: item.likelihood, reason: item.reason, icon: ['↗', 'ϟ', '✳', '↗', 'ϟ'][index % 5], color: ['lime', 'orange', 'blue', 'lime', 'orange'][index % 5] })));
      setStudyOrder(payload.studyOrder);
      setAnswers(payload.answers.map((item, index) => ({ id: `answer-${index}`, num: String(index + 1).padStart(2, '0'), q: item.question, tag: `${item.marks} marks · priority pick`, intro: item.intro, points: item.points, tip: item.tip })));
      setQuizItems(payload.quiz); setMemoryItems(payload.memory); setPanicItems(payload.panicPlan);
      setConfidence(payload.confidence); setWeakArea(payload.weakArea); setAudioSummary(payload.audioSummary);
      setExpanded('answer-0'); setQuizIndex(0); setQuizAnswer(''); setQuizChecked(false); setQuizFeedback('');
      setApiConfigured(true); document.querySelector('#results')?.scrollIntoView({ behavior: 'smooth' });
    } catch (error) { flash(error.message); }
    finally { setLoading(false); }
  };
  const scrollTo = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const download = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
    let y = 22;
    const margin = 25;
    const addPage = () => { doc.addPage(); y = 22; };
    const write = (text, size, options = {}) => {
      doc.setFont('helvetica', options.bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...(options.color || [48, 73, 120]));
      const lines = doc.splitTextToSize(text, pageW - margin - 18);
      if (y + lines.length * size * .48 > pageH - 18) addPage();
      doc.text(lines, margin + 9, y); y += lines.length * size * .48 + (options.after ?? 4);
    };
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(70, 120, 85); doc.text('DIGITAL ORBIT  /  NIGHT NOTES', margin + 9, y); y += 9;
    doc.setFontSize(18); doc.setTextColor(24, 36, 59); doc.text(loadedSubject, margin + 9, y); y += 12;
    for (const answer of answers) {
      if (y > pageH - 50) addPage();
      doc.setDrawColor(239, 125, 128); doc.setLineWidth(.35); doc.line(margin, 12, margin, pageH - 12);
      write(answer.q, 15, { bold: true, after: 6 }); write(answer.intro, 11, { after: 5 });
      for (const [i, point] of answer.points.entries()) write(`${String(i + 1).padStart(2, '0')}   ${point}`, 11, { after: 3 });
      write(`EXAM TIP: ${answer.tip}`, 10, { bold: true, color: [36, 92, 58], after: 11 });
    }
    doc.save('digital-orbit-night-notes.pdf'); flash('Your notes are on the way 📄');
  };
  const share = async () => { try { await navigator.clipboard.writeText(window.location.href); flash('Link copied. Send it to your study group ↗'); } catch { flash('Send this page to your study group ↗'); } };
  const currentQuiz = quizItems[quizIndex] || quizItems[0];
  const submitQuiz = async () => {
    if (!quizAnswer.trim()) return flash('One quick answer — go on.');
    setCheckingAnswer(true);
    try {
      const response = await fetch('/api/check-answer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: currentQuiz.question, expected: currentQuiz.expected, answer: quizAnswer }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not check that answer.');
      setQuizChecked(true); setQuizFeedback(payload.feedback); setQuizCorrect(payload.correct);
    } catch (error) { flash(error.message); }
    finally { setCheckingAnswer(false); }
  };
  const [quizCorrect, setQuizCorrect] = useState(false);
  const nextQuiz = () => { setQuizIndex((quizIndex + 1) % quizItems.length); setQuizAnswer(''); setQuizChecked(false); setQuizFeedback(''); };

  return <main>
    <div className="grain" aria-hidden="true" />
    <header className="topbar"><a className="brand" href="#top"><span className="brand-mark">◉</span><span>digital orbit <small>by ORIN</small></span></a><span className="top-note"><span className="live-dot" /> NIGHT SHIFT · 01:42 AM</span><a className="help-link" href="#panic">Need a plan? <ArrowRight size={13}/></a></header>

    <section className="hero" id="top">
      <div className="hero-copy"><div className="hero-kicker"><span className="kicker-line"/> THE NIGHT BEFORE, SORTED <span className="kicker-star">✳</span></div><h1>Exam<br/>tomorrow<span className="question">?</span><span className="hero-emoji">😰</span></h1><p className="hero-sub">Okay. Deep breath. Let’s get you<br className="desktop-break"/> to <em>pass marks</em> — one smart move at a time.</p><div className="hero-footnote"><span>01 / 07</span><span className="foot-rule"/><span>YOUR EMERGENCY STUDY PLAN</span></div></div>
      <div className="orbit-doodle" aria-hidden="true"><div className="orbit-ring ring-a"/><div className="orbit-ring ring-b"/><div className="orbit-core">DO<span>✳</span></div><span className="orbit-planet">✦</span><span className="orbit-caption">you’ve got this</span></div>
      <div className="hero-sticker">No all-nighters<br/>without a plan <span>↘</span></div>
    </section>

    <section className="prompt-wrap" aria-label="Create study plan">
      <div className="prompt-meta"><span className="step-no">01</span><span>FIRST THINGS FIRST</span><span className="prompt-meta-right">~ 30 SECONDS TO START</span></div>
      <label htmlFor="topic-input" className="input-label">What are we cramming?</label>
      <div className="input-shell"><Sparkles size={17}/><input id="topic-input" value={topic} onChange={e=>setTopic(e.target.value)} onKeyDown={e=>e.key==='Enter'&&generate()} placeholder="Subject, topic, or paste that scary question…"/><span className="input-shortcut">↵</span></div>
      <div className="goal-row"><span className="goal-label">MY GOAL</span>{[['pass','Just pass','40 marks'],['safe','Safe score','60+'],['topper','Topper mode','Let’s go']].map(([id,label,sub])=><button key={id} onClick={()=>setGoal(id)} className={`goal-option ${goal===id?'selected':''}`}><span className="radio-dot"/><span>{label}<small>{sub}</small></span></button>)}</div>
      <button className="primary-button" onClick={generate}><span>{loading?'Getting your notes…':'Get me pass marks'}</span>{loading?<span className="button-spinner"/>:<ArrowRight size={18}/>}</button>
      <div className="privacy-note"><span>✳</span> {apiConfigured ? 'Grok is connected. Your key stays on this server.' : 'Add your Grok key in .env to generate your plan.'}</div>
    </section>

    <section className="results-section" id="results">
      <div className="results-banner"><div><span className="eyebrow">YOUR LAST-MINUTE GAME PLAN</span><h2>{loading?'Putting the pieces together…':<>Alright, {loadedSubject}<br className="mobile-break"/> <span>— here’s the move.</span></>}</h2></div><div className="results-stamp"><span>MADE FOR</span><strong>{goal==='pass'?'THE PASS':goal==='safe'?'THE 60+':'THE TOP'}</strong><span>NOT THE TEXTBOOK</span></div></div>
      <AnimatePresence>{loading&&<motion.div className="loading-strip" initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}}><div className="loading-status"><span className="button-spinner dark"/> {['Checking previous papers…','Finding important topics…','Preparing exam answers…'][loadingStep]} <span className="loading-step">Your useful bits are coming together</span></div><div className="skeletons"><i/><i/><i/></div></motion.div>}</AnimatePresence>

      <div className="results-grid">
        <section className="topic-panel" id="plan"><SectionHead eyebrow="01 — STUDY THESE FIRST" title="High probability*" side={<span className="hand-note">*model estimate ↘</span>}/><div className="topic-list">{topics.map((t,i)=><motion.div className="topic-row" key={t.name} initial={{opacity:0,x:-12}} whileInView={{opacity:1,x:0}} viewport={{once:true}} transition={{delay:i*.08}}><span className="topic-rank">0{i+1}</span><span className={`topic-icon ${t.color}`}>{t.icon}</span><span className="topic-name">{t.name}<small>{t.reason}</small></span><span className="topic-prob">{t.pct}<small>%</small></span></motion.div>)}</div><div className="study-order"><span>THE ORDER</span><p>{studyOrder}</p><span className="order-time"><Clock3 size={13}/> ~ 90 min</span></div></section>

        <section className="confidence-panel"><div className="confidence-head"><span className="eyebrow">YOUR READINESS, ROUGHLY</span><span className="confidence-spark">✳</span></div><div className="confidence-number">{confidence}<span>%</span><span className="confidence-check"><Check size={13}/></span></div><div className="confidence-caption">rough starting estimate <span>Changes as you work through the plan</span></div><div className="confidence-track"><motion.div initial={{width:0}} whileInView={{width:`${confidence}%`}} viewport={{once:true}} transition={{duration:1,ease:'easeOut'}}/></div><div className="weak-area"><span className="weak-icon">!</span><span>Watch this bit</span><strong>{weakArea}</strong></div><div className="scribble">very doable, honestly</div></section>
      </div>

      <section className="answers-section" id="answers"><SectionHead eyebrow="02 — READY-TO-WRITE ANSWERS" title="The marks are in the details." side={<span className="answer-side-note">Short enough to remember.<br/>Structured enough to score.</span>}/><div className="answer-list">{answers.map((a,i)=><article className={`answer-paper paper-${i}`} key={a.id} ref={el=>answerRefs.current[a.id]=el}><div className="paper-top"><span className="paper-index">{a.num} / ANSWER SHEET</span><span className="paper-tag"><span/> {a.tag}</span><button className="paper-toggle" onClick={()=>setExpanded(expanded===a.id?'':a.id)} aria-label={expanded===a.id?'Collapse answer':'Expand answer'}>{expanded===a.id?<X size={16}/>:<Plus size={16}/>}</button></div><button className="question-line" onClick={()=>setExpanded(expanded===a.id?'':a.id)}><span>Q.</span><strong>{a.q}</strong><ChevronDown className={expanded===a.id?'rotated':''} size={17}/></button><AnimatePresence initial={false}>{expanded===a.id&&<motion.div className="answer-content" initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:.28}}><p className="answer-intro">{a.intro}</p><div className="answer-label">KEY POINTS <span>✎</span></div><ol>{a.points.map((p,j)=><li key={p}><span className="point-num">{String(j+1).padStart(2,'0')}</span><span>{p.split(/(Application|Presentation|Session|Transport|Network|Data Link|Physical|Mutual exclusion|Hold and wait|No preemption|Circular wait)/g).map((bit,k)=>/^(Application|Presentation|Session|Transport|Network|Data Link|Physical|Mutual exclusion|Hold and wait|No preemption|Circular wait)$/.test(bit)?<mark key={k}>{bit}</mark>:bit)}</span></li>)}</ol><div className="exam-tip"><Lightbulb size={15}/><span><b>Write this for full marks:</b> {a.tip}</span></div><div className="paper-actions"><button onClick={()=>flash('Answer preview is ready 👁')}><BookOpen size={14}/> Preview</button><button onClick={download}><Download size={14}/> Download notes</button></div></motion.div>}</AnimatePresence><div className="margin-line"/></article>)}</div></section>

      <div className="mid-grid">
        <section className="audio-panel" id="audio"><div className="audio-top"><span className="eyebrow">03 — LISTEN WHILE YOU RESET</span><AudioLines size={17}/></div><div className="audio-title"><Headphones size={22}/><h3>Last-minute<br/><em>brain injection</em></h3></div><p>Listen to a spoken recap of your generated notes.</p><div className="waveform" aria-hidden="true">{Array.from({length:38},(_,i)=><i key={i} style={{'--h':`${12+((i*17+8)%35)}px`}} className={playing&&i<17?'heard':''}/>)}</div><div className="audio-controls"><button className="play-button" onClick={()=>setPlaying(!playing)} aria-label={playing?'Pause audio':'Play audio'}>{playing?<Pause size={17} fill="currentColor"/>:<Play size={17} fill="currentColor"/>}</button><span className="audio-time">{playing?'SPEAKING':'VOICE NOTE'} <span>· {speed}</span></span><div className="speed-control">{['1x','1.5x','2x'].map(s=><button key={s} className={speed===s?'active':''} onClick={()=>setSpeed(s)}>{s}</button>)}</div></div><div className="audio-foot"><Volume2 size={13}/> Take a breath. You’re doing fine.</div></section>

        <section className="quiz-panel" id="test"><div className="quiz-head"><span className="eyebrow">04 — QUICK REALITY CHECK</span><span className="quiz-timer"><Clock3 size={12}/> 3 MIN</span></div><h3>🚨 Let’s see what stuck.</h3><div className="quiz-progress"><span style={{width:`${((quizIndex+1)/quizItems.length)*100}%`}}/></div><div className="quiz-question"><span>QUESTION {String(quizIndex+1).padStart(2,'0')} / {String(quizItems.length).padStart(2,'0')}</span><p>{currentQuiz.question}</p></div><div className="quiz-input-row"><input value={quizAnswer} onChange={e=>setQuizAnswer(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submitQuiz()} placeholder="Type it out — rough is fine"/><button className="voice-button" aria-label="Voice answer" onClick={()=>{ const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition; if(!Recognition)return flash('Voice input is not available in this browser.'); const recognition=new Recognition(); recognition.onresult=event=>setQuizAnswer(event.results[0][0].transcript); recognition.start(); }}><Volume2 size={16}/></button></div>{quizChecked?<div className={`quiz-feedback ${quizCorrect?'correct':'incorrect'}`}><span>{quizCorrect?'✓':'↗'}</span><p>{quizFeedback}</p></div>:<button className="check-answer" disabled={checkingAnswer} onClick={submitQuiz}>{checkingAnswer?'Checking your answer…':'Check my answer'} <ArrowRight size={15}/></button>}<button className="quiz-next" onClick={quizChecked?nextQuiz:()=>flash('One question at a time. No pressure.')}>{quizChecked?'Next question →':'✳  One question at a time. No pressure.'}</button></section>
      </div>

      <section className="memory-section"><div className="memory-heading"><div><span className="eyebrow">05 — TINY THINGS THAT STICK</span><h2>Memory hooks <span>✳</span></h2></div><span className="swipe-hint">SWIPE FOR MORE <ArrowRight size={12}/></span></div><div className="memory-scroll">{memoryItems.map((item,i)=><article className={`memory-card ${['memory-lime','memory-paper','memory-blue'][i%3]}`} key={`${item.label}-${i}`}><span>{item.label}</span><strong>{item.title}</strong><small>{item.note}</small><i>{i%2?'✳':'↗'}</i></article>)}</div></section>

      <section className="panic-section" id="panic"><div className="panic-title"><span className="eyebrow">06 — DON’T SPEND 40 MINUTES PLANNING</span><h2>Your next 2 hours,<br/><em>already figured out.</em></h2><p>Adjust it if you need. Starting is the hard bit.</p></div><div className="timeline"><div className="timeline-now"><span className="now-dot"/> START HERE <span>YOUR STUDY BLOCKS</span></div>{panicItems.map((item,i)=><div className="timeline-row" key={`${item.title}-${i}`}><time>{item.minutes}<span>—</span>MIN</time><div className={`timeline-bullet ${['lime-bullet','orange-bullet','blue-bullet','purple-bullet'][i%4]}`}/><div className="timeline-task"><strong>{item.title}</strong><small>{item.note}</small></div><span className="task-tag">{item.minutes} MIN</span></div>)}<div className="timeline-end"><span>✳</span> Look at you. Already moving.</div></div></section>

      <section className="final-cta"><div className="cta-doodle" aria-hidden="true">✳</div><span className="eyebrow">YOU CAME HERE PANICKING.</span><h2>Look at you now.<br/><em>Actually ready.</em></h2><p>Take the notes with you. Send them to the friend who’s also awake.</p><div className="cta-actions"><button className="primary-button" onClick={download}><Download size={16}/> Download all notes</button><button className="share-button" onClick={share}><Share2 size={16}/> Send to a friend</button></div><span className="cta-signoff">Made for the night-before crew <span>✳</span></span></section>
    </section>

    <footer><a className="brand footer-brand" href="#top"><span className="brand-mark">◉</span><span>digital orbit <small>by ORIN</small></span></a><span>YOU’VE GOT THIS. GO GET SOME MARKS.</span><button onClick={()=>scrollTo('top')}>BACK TO TOP ↑</button></footer>

    <div className="sticky-audio" data-visible={playing}><button onClick={()=>setPlaying(!playing)} aria-label={playing?'Pause audio':'Play audio'}>{playing?<Pause size={15}/>:<Play size={15} fill="currentColor"/>}</button><div className="sticky-track"><div className={playing?'progress-moving':''}/></div><span>Brain injection <small>{speed}</small></span><button className="sticky-close" onClick={()=>setPlaying(false)} aria-label="Close player"><X size={15}/></button></div>
    <nav className="bottom-nav" aria-label="Jump to section">{[['plan','◉','Plan'],['answers','▤','Answers'],['audio','♫','Audio'],['test','⌁','Test']].map(([id,icon,label])=><button key={id} className={activeNav===id?'active':''} onClick={()=>scrollTo(id)}><span>{icon}</span>{label}</button>)}</nav>
    <AnimatePresence>{toast&&<motion.div className="toast" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:8}}><span>✳</span> {toast}<button onClick={()=>setToast('')}><X size={14}/></button></motion.div>}</AnimatePresence>
  </main>;
}

export default App;
