import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const blue = '#173F83';
const accents = {
  Definition: '#245EA6', Explanation: '#654C9D', 'Key Points': '#217A66',
  Diagram: '#B16427', Conclusion: '#286747', Keywords: '#A43A51'
};

function fontPath(file) {
  const candidates = [path.join(projectRoot, 'fonts', file), path.join(process.cwd(), 'fonts', file)];
  const match = candidates.find(candidate => fs.existsSync(candidate));
  if (!match) throw Object.assign(new Error(`PDF font asset is missing: ${file}`), { code: 'PDF_FONT_MISSING' });
  return match;
}

function normalizeAnswers(data = {}) {
  const source = Array.isArray(data.answers) ? data.answers : [data];
  return source.map((answer, index) => {
    const items = answer.keyPoints || answer.points || [];
    const points = items.map(point => {
      if (typeof point !== 'string') return { title: String(point.title || ''), desc: String(point.desc || '') };
      const split = point.match(/^([^:–-]{2,55})\s*[:–-]\s*(.+)$/);
      return split ? { title: split[1].trim(), desc: split[2].trim() } : { title: '', desc: point };
    });
    return {
      question: String(answer.question || `Question ${index + 1}`),
      definition: String(answer.definition || ''), explanation: String(answer.explanation || ''), points,
      diagram: String(answer.diagram || ''), conclusion: String(answer.conclusion || ''),
      keywords: (answer.keywords || []).map(String)
    };
  });
}

function drawArrow(doc, x1, y1, x2, y2, color = '#315D9A') {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 5;
  doc.save().strokeColor(color).fillColor(color).lineWidth(1.5)
    .moveTo(x1, y1).lineTo(x2, y2).stroke()
    .moveTo(x2, y2)
    .lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6))
    .lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6))
    .closePath().fill().restore();
}

function drawTopicDiagram(doc, answer, x, y, width) {
  const topic = `${answer.question} ${answer.diagram} ${answer.points.map(point => point.title).join(' ')}`.toLowerCase();
  const ink = '#173F83';
  const pink = '#F5E1E3';
  const mint = '#E3F2E9';
  const lavender = '#ECE8F6';
  const box = (label, bx, by, bw, bh, fill = '#F1F5FA', fontSize = 10) => {
    doc.save().roundedRect(bx, by, bw, bh, 6).fillAndStroke(fill, '#7892B5');
    doc.font('KalamBold').fontSize(fontSize).fillColor(ink).text(label, bx + 5, by + 4, { width: bw - 10, height: bh - 8, align: 'center', valign: 'center' });
    doc.restore();
  };

  if (/osi|open systems interconnection/.test(topic)) {
    const labels = ['Application', 'Presentation', 'Session', 'Transport', 'Network', 'Data Link', 'Physical'];
    const rowH = 17; const gap = 4; const bx = x + width * 0.2; const bw = width * 0.6;
    labels.forEach((label, i) => box(`${7 - i}. ${label}`, bx, y + i * (rowH + gap), bw, rowH, i % 2 ? lavender : mint, 9));
    return labels.length * (rowH + gap) - gap;
  }

  if (/deadlock|circular wait|resource allocation/.test(topic)) {
    const left = x + width * 0.14; const right = x + width * 0.66; const nodeY = y + 29; const nodeW = width * 0.2; const nodeH = 27;
    box('Process P1', left, nodeY, nodeW, nodeH, pink, 9);
    box('Process P2', right, nodeY, nodeW, nodeH, pink, 9);
    box('Resource R1', x + width * 0.39, y, width * 0.22, 22, lavender, 9);
    box('Resource R2', x + width * 0.39, y + 64, width * 0.22, 22, mint, 9);
    drawArrow(doc, left + nodeW, nodeY + 5, x + width * 0.43, y + 20, ink);
    drawArrow(doc, x + width * 0.61, y + 20, right, nodeY + 5, ink);
    drawArrow(doc, right, nodeY + nodeH - 4, x + width * 0.61, y + 73, ink);
    drawArrow(doc, x + width * 0.39, y + 73, left + nodeW, nodeY + nodeH - 4, ink);
    doc.font('Kalam').fontSize(9).fillColor(ink).text('Circular wait', x, y + 94, { width, align: 'center' });
    return 110;
  }

  if (/machine learning|supervised|unsupervised|reinforcement/.test(topic)) {
    const labels = ['Supervised\nLabeled examples', 'Unsupervised\nFind patterns', 'Reinforcement\nReward and feedback'];
    const gap = 8; const bw = (width - gap * 2) / 3;
    labels.forEach((label, i) => box(label, x + i * (bw + gap), y + 10, bw, 48, [mint, lavender, pink][i], 9));
    doc.font('Kalam').fontSize(9).fillColor(ink).text('Three common learning approaches', x, y + 63, { width, align: 'center' });
    return 78;
  }

  const steps = answer.points.map(point => point.title || point.desc).filter(Boolean).slice(0, 4);
  if (steps.length > 1) {
    const gap = 17; const bw = Math.min(110, (width - gap * (steps.length - 1)) / steps.length); const total = bw * steps.length + gap * (steps.length - 1); const start = x + (width - total) / 2;
    steps.forEach((step, i) => {
      const bx = start + i * (bw + gap);
      box(step, bx, y + 12, bw, 38, i % 2 ? lavender : mint, 9);
      if (i < steps.length - 1) drawArrow(doc, bx + bw + 2, y + 31, bx + bw + gap - 2, y + 31, ink);
    });
    doc.font('Kalam').fontSize(9).fillColor(ink).text('Related concepts at a glance', x, y + 57, { width, align: 'center' });
    return 72;
  }

  return 0;
}

export default function generatePDF(data, fileName, options = {}) {
  const answers = normalizeAnswers(data);
  const revision = Boolean(options.revision);
  let regularFont; let boldFont;
  try { regularFont = fontPath('Kalam-Regular.ttf'); boldFont = fontPath('Kalam-Bold.ttf'); }
  catch (error) { return Promise.reject(error); }

  return new Promise((resolve, reject) => {
    // Every visible text element uses Kalam; skip loading PDFKit's default Helvetica metrics.
    const doc = new PDFDocument({ size: 'A4', margins: { top: 66, bottom: 54, left: 78, right: 48 }, bufferPages: false, font: false });
    const chunks = []; let pageNumber = 0;
    doc.registerFont('Kalam', regularFont); doc.registerFont('KalamBold', boldFont);

    const drawPage = () => {
      pageNumber += 1;
      const savedX = doc.x; const savedY = doc.y; const { width, height } = doc.page;
      doc.save(); doc.rect(0, 0, width, height).fill('#FDFDFD');
      doc.lineWidth(0.45).strokeColor('#DDE5EF');
      for (let y = 58; y < height - 30; y += 25) doc.moveTo(22, y).lineTo(width - 20, y).stroke();
      doc.lineWidth(1.1).strokeColor('#D8757D').moveTo(55, 0).lineTo(55, height).stroke();
      doc.font('Kalam').fontSize(14).fillColor(blue).text(`Page ${pageNumber}`, width - 105, 22, { width: 78, align: 'right', lineBreak: false });
      doc.restore(); doc.x = savedX; doc.y = savedY;
      doc.x = doc.page.margins.left; doc.y = 68;
    };
    doc.on('pageAdded', drawPage); drawPage();
    doc.on('data', chunk => chunks.push(chunk)); doc.on('error', reject);
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);
      if (!fileName) return resolve(buffer);
      const output = fs.createWriteStream(fileName);
      output.on('error', reject); output.on('finish', () => resolve(fileName)); output.end(buffer);
    });

    const textWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const ensureRoom = height => { if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage(); };
    const heading = label => {
      ensureRoom(42); doc.moveDown(0.45); doc.font('KalamBold').fontSize(15).fillColor(accents[label] || blue)
        .text(label, doc.page.margins.left, doc.y, { width: textWidth, underline: true, lineGap: 1 });
      doc.moveDown(0.18);
    };
    const paragraph = (text, size = 13.5, color = blue) => {
      if (text) doc.font('Kalam').fontSize(size).fillColor(color).text(text, { width: textWidth, lineGap: 4, paragraphGap: 3 });
    };

    doc.font('KalamBold').fontSize(revision ? 17 : 21).fillColor(blue)
      .text(String(revision ? 'One-page revision' : data.title || data.subject || 'Exam Answer Notes'), { width: textWidth, align: 'center' });
    doc.moveDown(0.65);
    answers.forEach((answer, index) => {
      if (!revision) ensureRoom(100);
      const question = revision ? `${answer.question.slice(0, 130)}${answer.question.length > 130 ? '...' : ''}` : answer.question;
      doc.font('KalamBold').fontSize(revision ? 12.5 : 17).fillColor(accents.Keywords).text(`Q${index + 1}. `, { continued: true });
      doc.font('KalamBold').fillColor(blue).text(question, { width: textWidth, lineGap: revision ? 1 : 3 });
      if (revision) {
        const words = (answer.keywords.length ? answer.keywords : answer.points.map(p => p.title || p.desc)).slice(0, 7);
        paragraph(`KEYWORDS: ${words.join(' - ').toLocaleUpperCase()}`, 9.5, accents.Keywords);
        doc.moveDown(0.18); return;
      }
      if (answer.definition) { heading('Definition'); paragraph(answer.definition); }
      if (answer.explanation) { heading('Explanation'); paragraph(answer.explanation); }
      if (answer.points.length) {
        heading('Key Points');
        answer.points.forEach((point, pointIndex) => {
          ensureRoom(36);
          const color = pointIndex % 2 ? accents.Explanation : accents['Key Points'];
          doc.font('KalamBold').fontSize(12.5).fillColor(accents.Keywords).text(`${pointIndex + 1}) `, { continued: true });
          if (point.title) doc.font('KalamBold').fillColor(color).text(`${point.title}: `, { continued: true });
          doc.font('Kalam').fontSize(13.5).fillColor(blue).text(point.desc, { width: textWidth - 5, lineGap: 4, indent: 5 });
        });
      }
      if (answer.diagram && !/^not needed\.?$/i.test(answer.diagram.trim())) {
        heading('Diagram');
        const diagramHeight = /osi|open systems interconnection/i.test(`${answer.question} ${answer.diagram}`) ? 143 : 120;
        ensureRoom(diagramHeight);
        const diagramY = doc.y;
        const drawnHeight = drawTopicDiagram(doc, answer, doc.page.margins.left, diagramY, textWidth);
        if (drawnHeight) {
          doc.y = diagramY + drawnHeight + 8;
        } else {
          paragraph(answer.diagram, 13.5, accents.Diagram);
        }
      }
      if (answer.conclusion) { heading('Conclusion'); paragraph(answer.conclusion, 13.5, accents.Conclusion); }
      if (answer.keywords.length) { heading('Keywords'); paragraph(answer.keywords.join(' - ').toLocaleUpperCase(), 13, accents.Keywords); }
      doc.moveDown(0.75);
    });
    doc.end();
  });
}
