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

function normalizePdfText(value = '') {
  return String(value).normalize('NFD')
    .replace(/([A-Za-z])\u0304/g, '$1_mean')
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, char => `_${'₀₁₂₃₄₅₆₇₈₉'.indexOf(char)}`)
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, char => `^${'⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(char)}`)
    .replace(/[ᵢⱼₙ]/g, char => ({ 'ᵢ': '_i', 'ⱼ': '_j', 'ₙ': '_n' })[char])
    .replace(/[βΒ]/g, 'beta').replace(/[εΕ]/g, 'epsilon').replace(/Σ|∑/g, 'SUM')
    .replace(/[μΜ]/g, 'mu').replace(/[θΘ]/g, 'theta').replace(/[λΛ]/g, 'lambda')
    .replace(/[αΑ]/g, 'alpha').replace(/[Δδ]/g, 'delta').replace(/[πΠ]/g, 'pi')
    .replace(/[σ]/g, 'sigma').replace(/[φΦ]/g, 'phi').replace(/[ωΩ]/g, 'omega')
    .replace(/[×·]/g, '*').replace(/[÷]/g, '/').replace(/[−–—]/g, '-')
    .replace(/[≤]/g, '<=').replace(/[≥]/g, '>=').replace(/[≠]/g, '!=').replace(/[≈]/g, 'approximately')
    .replace(/[→⇒]/g, ' to ').replace(/[←]/g, ' from ').replace(/[√]/g, 'sqrt ')
    .replace(/[∞]/g, 'infinity').replace(/[∈]/g, 'in').replace(/[□]/g, '[symbol]')
    .replace(/\s{2,}/g, ' ').trim().normalize('NFC');
}

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
      if (typeof point !== 'string') return { title: normalizePdfText(point.title), desc: normalizePdfText(point.desc) };
      const split = point.match(/^([^:–-]{2,55})\s*[:–-]\s*(.+)$/);
      return split ? { title: normalizePdfText(split[1]), desc: normalizePdfText(split[2]) } : { title: '', desc: normalizePdfText(point) };
    });
    return {
      question: normalizePdfText(answer.question || `Question ${index + 1}`),
      definition: normalizePdfText(answer.definition), explanation: normalizePdfText(answer.explanation), points,
      diagram: normalizePdfText(answer.diagram), conclusion: normalizePdfText(answer.conclusion),
      keywords: (answer.keywords || []).map(normalizePdfText)
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
  const text = (label, tx, ty, tw, size = 8.5, color = ink, align = 'center') => {
    doc.font('Kalam').fontSize(size).fillColor(color).text(label, tx, ty, { width: tw, align, lineGap: 1 });
  };

  if (/osi|open systems interconnection/.test(topic)) {
    const layers = [
      ['7  Application', 'HTTP  ·  DNS'], ['6  Presentation', 'TLS  ·  JPEG'], ['5  Session', 'RPC  ·  NetBIOS'],
      ['4  Transport', 'TCP  ·  UDP'], ['3  Network', 'IP  ·  ICMP'], ['2  Data Link', 'Ethernet  ·  Wi-Fi'], ['1  Physical', 'Signals  ·  Bits']
    ];
    const rowH = 17; const gap = 4; const bx = x + width * 0.15; const bw = width * 0.57;
    text('OSI MODEL  ·  7-LAYER STACK', bx, y, bw, 9, '#654C9D');
    layers.forEach(([label, protocol], i) => {
      const rowY = y + 15 + i * (rowH + gap);
      box(label, bx, rowY, bw, rowH, i % 2 ? lavender : mint, 8.7);
      text(protocol, bx + bw + 9, rowY + 4, width - (bx - x) - bw - 9, 8, '#315D9A', 'left');
      if (i < layers.length - 1) drawArrow(doc, bx - 9, rowY + rowH - 1, bx - 9, rowY + rowH + gap - 1, '#B16427');
    });
    text('Each layer serves the one above it', bx, y + 160, bw, 8, '#315D9A');
    return 174;
  }

  if (/deadlock|circular wait|resource allocation/.test(topic)) {
    const nodeY = y + 53; const nodeH = 29; const nodeW = 93;
    const p1x = x + 9; const p2x = x + width - nodeW - 9; const cx = x + width / 2;
    const r1y = y + 13; const r2y = y + 108; const radius = 18;
    text('RESOURCE ALLOCATION GRAPH', x, y, width, 9, '#654C9D');
    box('Process P1', p1x, nodeY, nodeW, nodeH, pink, 9);
    box('Process P2', p2x, nodeY, nodeW, nodeH, pink, 9);
    [r1y, r2y].forEach((cy, i) => {
      doc.save().circle(cx, cy + radius, radius).fillAndStroke(i ? mint : lavender, '#7892B5');
      doc.font('KalamBold').fontSize(8.5).fillColor(ink).text(`R${i + 1}`, cx - radius, cy + radius - 6, { width: radius * 2, align: 'center' }).restore();
    });
    // Allocation edges point resource → process; request edges point process → resource.
    drawArrow(doc, cx - 15, r1y + 32, p2x + 4, nodeY + 5, '#217A66');
    drawArrow(doc, p2x + 8, nodeY + nodeH - 3, cx + 14, r2y + 4, '#B16427');
    drawArrow(doc, cx + 15, r2y + 4, p1x + nodeW - 4, nodeY + nodeH - 3, '#217A66');
    drawArrow(doc, p1x + nodeW - 2, nodeY + 4, cx - 14, r1y + 32, '#B16427');
    drawArrow(doc, x + width * 0.26, y + 150, x + width * 0.38, y + 150, '#217A66');
    text('Allocated', x + width * 0.38, y + 145, width * 0.16, 8, '#217A66', 'left');
    drawArrow(doc, x + width * 0.61, y + 150, x + width * 0.73, y + 150, '#B16427');
    text('Request', x + width * 0.73, y + 145, width * 0.2, 8, '#B16427', 'left');
    return 164;
  }

  if (/machine learning|supervised|unsupervised|reinforcement/.test(topic)) {
    const gap = 8; const bw = (width - gap * 2) / 3; const top = y + 37; const cardH = 77;
    box('TRAINING DATA', x + width * 0.34, y, width * 0.32, 23, '#F1F5FA', 9);
    const cards = [
      { title: 'SUPERVISED', detail: 'Labeled examples', example: 'Spam detection', fill: mint },
      { title: 'UNSUPERVISED', detail: 'Finds patterns', example: 'Customer groups', fill: lavender },
      { title: 'REINFORCEMENT', detail: 'Reward / feedback', example: 'Game strategy', fill: pink }
    ];
    cards.forEach((card, i) => {
      const bx = x + i * (bw + gap);
      drawArrow(doc, x + width / 2, y + 24, bx + bw / 2, top - 2, '#7892B5');
      box(`${card.title}\n${card.detail}\n\nExample: ${card.example}`, bx, top, bw, cardH, card.fill, 8.4);
      drawArrow(doc, bx + bw / 2, top + cardH + 2, x + width / 2, y + 141, '#7892B5');
    });
    box('PREDICTION  ·  DECISION  ·  ACTION', x + width * 0.22, y + 142, width * 0.56, 23, '#FFF0D9', 8.5);
    return 170;
  }

  const ideas = answer.points.slice(0, 8);
  const cards = ideas.length ? ideas : [{ title: 'Core idea', desc: answer.definition || answer.explanation || answer.question }];
  const columns = cards.length === 1 ? 1 : 2;
  const gapX = 10; const gapY = 8; const cardW = (width - gapX * (columns - 1)) / columns;
  const cardH = 42; const rows = Math.ceil(cards.length / columns); const cardsY = y + 32;
  box('QUESTION / KEY IDEAS', x + width * 0.28, y, width * 0.44, 24, '#FFF0D9', 8.5);
  cards.forEach((idea, i) => {
    const col = i % columns; const row = Math.floor(i / columns); const bx = x + col * (cardW + gapX); const by = cardsY + row * (cardH + gapY);
    doc.save().roundedRect(bx, by, cardW, cardH, 6).fillAndStroke(i % 2 ? lavender : mint, '#7892B5');
    const title = String(idea.title || idea.desc || `Key idea ${i + 1}`).slice(0, 62);
    const desc = idea.title && idea.desc ? String(idea.desc).slice(0, 95) : '';
    doc.font('KalamBold').fontSize(8.7).fillColor(ink).text(`${i + 1}. ${title}`, bx + 7, by + 4, { width: cardW - 14, height: 15, ellipsis: true });
    if (desc) doc.font('Kalam').fontSize(7.7).fillColor('#315D9A').text(desc, bx + 7, by + 20, { width: cardW - 14, height: 18, ellipsis: true });
    doc.restore();
    if (row === 0) drawArrow(doc, x + width / 2, y + 25, bx + cardW / 2, by - 1, '#7892B5');
  });
  const height = 33 + rows * cardH + (rows - 1) * gapY;
  text('KEY CONCEPTS FROM THIS ANSWER', x, y + height + 2, width, 8, '#654C9D');
  return height + 15;
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
      .text(normalizePdfText(revision ? 'One-page revision' : data.title || data.subject || 'Exam Answer Notes'), { width: textWidth, align: 'center' });
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
      {
        const topicText = `${answer.question} ${answer.diagram} ${answer.points.map(point => point.title).join(' ')}`;
        const diagramHeight = /osi|open systems interconnection/i.test(topicText) ? 174
          : /deadlock|circular wait|resource allocation/i.test(topicText) ? 164
            : /machine learning|supervised|unsupervised|reinforcement/i.test(topicText) ? 170
              : 48 + Math.ceil(Math.min(answer.points.length || 1, 8) / 2) * 50;
        // Keep the heading with its illustration when a page break is needed.
        ensureRoom(diagramHeight + 58);
        heading('Diagram');
        const diagramY = doc.y;
        const drawnHeight = drawTopicDiagram(doc, answer, doc.page.margins.left, diagramY, textWidth);
        doc.y = diagramY + drawnHeight + 8;
      }
      if (answer.conclusion) { heading('Conclusion'); paragraph(answer.conclusion, 13.5, accents.Conclusion); }
      if (answer.keywords.length) { heading('Keywords'); paragraph(answer.keywords.join(' - ').toLocaleUpperCase(), 13, accents.Keywords); }
      doc.moveDown(0.75);
    });
    doc.end();
  });
}
