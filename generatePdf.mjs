import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { isMathQuestion, readableText as normalizePdfText } from './lib/format.js';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const blue = '#173F83';
const accents = {
  Definition: '#245EA6', Explanation: '#654C9D', 'Key Points': '#217A66',
  Diagram: '#B16427', Conclusion: '#286747', Keywords: '#A43A51',
  'Worked Solution': '#245EA6', 'Final Answer': '#286747'
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
      if (typeof point !== 'string') return { title: normalizePdfText(point.title), desc: normalizePdfText(point.desc) };
      const split = point.match(/^([^:–—-]{2,55})\s*[:–—-]\s*(.+)$/);
      return split ? { title: normalizePdfText(split[1]), desc: normalizePdfText(split[2]) } : { title: '', desc: normalizePdfText(point) };
    });
    return {
      question: normalizePdfText(answer.question || `Question ${index + 1}`),
      definition: normalizePdfText(answer.definition), explanation: normalizePdfText(answer.explanation), points,
      diagram: normalizePdfText(answer.diagram), conclusion: normalizePdfText(answer.conclusion),
      isMath: Boolean(answer.isMath) || isMathQuestion(answer.question, data.subject || data.title, answer.explanation),
      keywords: (answer.keywords || []).map(normalizePdfText),
      diagramSpec: {
        title: normalizePdfText(answer.diagramSpec?.title),
        layout: ['flow', 'layers', 'tree', 'cycle', 'network'].includes(answer.diagramSpec?.layout) ? answer.diagramSpec.layout : 'none',
        nodes: Array.isArray(answer.diagramSpec?.nodes) ? answer.diagramSpec.nodes.slice(0, 8).map((node, i) => ({ id: String(node.id || `n${i + 1}`), label: normalizePdfText(node.label), detail: normalizePdfText(node.detail) })) : [],
        edges: Array.isArray(answer.diagramSpec?.edges) ? answer.diagramSpec.edges.slice(0, 16).map(edge => ({ from: String(edge.from), to: String(edge.to), label: normalizePdfText(edge.label) })) : []
      }
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

function drawSpecDiagram(doc, spec, x, y, width) {
  const nodes = spec.nodes;
  if (!nodes || nodes.length < 2 || spec.layout === 'none') return 0;
  const palette = ['#E3F2E9', '#ECE8F6', '#F5E1E3', '#E7EFF9'];
  const positions = new Map();
  doc.font('KalamBold').fontSize(9).fillColor('#654C9D').text(spec.title || 'TOPIC STRUCTURE', x, y, { width, align: 'center' });
  const box = (node, bx, by, bw, bh, index) => {
    positions.set(node.id, { x: bx, y: by, w: bw, h: bh, cx: bx + bw / 2, cy: by + bh / 2 });
    doc.save().roundedRect(bx, by, bw, bh, 6).fillAndStroke(palette[index % palette.length], '#7892B5');
    doc.font('KalamBold').fontSize(9).fillColor('#173F83').text(node.label || node.id, bx + 5, by + 4, { width: bw - 10, height: 17, align: 'center', ellipsis: true });
    if (node.detail) doc.font('Kalam').fontSize(7.5).fillColor('#315D9A').text(node.detail, bx + 5, by + 20, { width: bw - 10, height: Math.max(10, bh - 23), align: 'center', ellipsis: true });
    doc.restore();
  };

  if (spec.layout === 'flow' || spec.layout === 'layers') {
    const vertical = spec.layout === 'layers' || nodes.length > 4;
    if (vertical) {
      const cardW = width * 0.68; const cardH = 32; const gap = 8; const left = x + (width - cardW) / 2;
      nodes.forEach((node, i) => box(node, left, y + 26 + i * (cardH + gap), cardW, cardH, i));
      const edges = spec.edges.length ? spec.edges : nodes.slice(1).map((node, i) => ({ from: nodes[i].id, to: node.id }));
      edges.forEach(edge => { const from = positions.get(edge.from); const to = positions.get(edge.to); if (from && to) drawArrow(doc, from.cx, from.y + from.h, to.cx, to.y, '#55769F'); });
      return 34 + nodes.length * (cardH + gap);
    }
    const gap = 12; const cardW = (width - gap * (nodes.length - 1)) / nodes.length; const cardH = 56;
    nodes.forEach((node, i) => box(node, x + i * (cardW + gap), y + 27, cardW, cardH, i));
    const edges = spec.edges.length ? spec.edges : nodes.slice(1).map((node, i) => ({ from: nodes[i].id, to: node.id }));
    edges.forEach(edge => { const from = positions.get(edge.from); const to = positions.get(edge.to); if (from && to) drawArrow(doc, from.x + from.w, from.cy, to.x, to.cy, '#55769F'); });
    return 98;
  }

  if (spec.layout === 'tree') {
    const root = nodes[0]; const children = nodes.slice(1); const rootW = Math.min(width * 0.42, 150); const childGap = 8;
    box(root, x + (width - rootW) / 2, y + 20, rootW, 42, 0);
    const columns = Math.min(children.length, 4); const rows = Math.ceil(children.length / columns); const childW = (width - childGap * (columns - 1)) / columns;
    children.forEach((node, i) => box(node, x + (i % columns) * (childW + childGap), y + 88 + Math.floor(i / columns) * 53, childW, 43, i + 1));
    const edges = spec.edges.length ? spec.edges : children.map(node => ({ from: root.id, to: node.id }));
    edges.forEach(edge => { const from = positions.get(edge.from); const to = positions.get(edge.to); if (from && to) drawArrow(doc, from.cx, from.y + from.h, to.cx, to.y, '#55769F'); });
    return 101 + rows * 53;
  }

  if (spec.layout === 'cycle') {
    const centerX = x + width / 2; const centerY = y + 92; const rx = Math.min(width * 0.36, 170); const ry = 56; const cardW = Math.min(width * 0.31, 125); const cardH = 38;
    nodes.forEach((node, i) => { const angle = -Math.PI / 2 + i * (Math.PI * 2 / nodes.length); box(node, centerX + Math.cos(angle) * rx - cardW / 2, centerY + Math.sin(angle) * ry - cardH / 2, cardW, cardH, i); });
    const edges = spec.edges.length ? spec.edges : nodes.map((node, i) => ({ from: node.id, to: nodes[(i + 1) % nodes.length].id }));
    edges.forEach(edge => { const from = positions.get(edge.from); const to = positions.get(edge.to); if (from && to) drawArrow(doc, from.cx, from.cy, to.cx, to.cy, '#55769F'); });
    // Repaint cards over the connector tips for a clean, readable cycle.
    nodes.forEach((node, i) => { const p = positions.get(node.id); box(node, p.x, p.y, p.w, p.h, i); });
    return 190;
  }

  const columns = Math.min(4, Math.ceil(Math.sqrt(nodes.length))); const rows = Math.ceil(nodes.length / columns); const gapX = 9; const gapY = 16;
  const cardW = (width - gapX * (columns - 1)) / columns; const cardH = 49;
  nodes.forEach((node, i) => box(node, x + (i % columns) * (cardW + gapX), y + 28 + Math.floor(i / columns) * (cardH + gapY), cardW, cardH, i));
  spec.edges.forEach(edge => { const from = positions.get(edge.from); const to = positions.get(edge.to); if (from && to) drawArrow(doc, from.cx, from.cy, to.cx, to.cy, '#55769F'); });
  nodes.forEach((node, i) => { const p = positions.get(node.id); box(node, p.x, p.y, p.w, p.h, i); });
  return 42 + rows * (cardH + gapY);
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

  if (/\bmlp\b|multi[- ]layer perceptron/.test(topic)) {
    const layers = [
      { name: 'INPUT LAYER', cx: x + width * 0.17, ys: [y + 51, y + 83, y + 115], labels: ['x1', 'x2', 'xn'], fill: mint },
      { name: 'HIDDEN LAYER', cx: x + width * 0.5, ys: [y + 43, y + 67, y + 91, y + 115, y + 139], labels: ['h1', 'h2', 'h3', 'h4', 'hn'], fill: lavender },
      { name: 'OUTPUT LAYER', cx: x + width * 0.83, ys: [y + 67, y + 103], labels: ['y1', 'yk'], fill: pink }
    ];
    text('MULTI-LAYER PERCEPTRON (MLP)', x, y, width, 9, '#654C9D');
    for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex++) {
      const from = layers[layerIndex]; const to = layers[layerIndex + 1];
      from.ys.forEach(fromY => to.ys.forEach(toY => {
        doc.save().lineWidth(0.7).strokeColor('#9AAEC9').moveTo(from.cx + 10, fromY).lineTo(to.cx - 10, toY).stroke().restore();
      }));
    }
    layers.forEach(layer => {
      text(layer.name, layer.cx - width * 0.15, y + 23, width * 0.3, 7.8, ink);
      layer.ys.forEach((cy, i) => {
        doc.save().circle(layer.cx, cy, 10).fillAndStroke(layer.fill, '#587AA8');
        doc.font('KalamBold').fontSize(7.2).fillColor(ink).text(layer.labels[i], layer.cx - 8, cy - 4, { width: 16, align: 'center', lineBreak: false }).restore();
      });
    });
    text('Signals move forward through weighted connections', x, y + 155, width, 8, '#315D9A');
    return 168;
  }

  if (answer.diagramSpec.layout !== 'none' && answer.diagramSpec.nodes.length > 1) {
    return drawSpecDiagram(doc, answer.diagramSpec, x, y, width);
  }

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

  return 0;
}

export default function generatePDF(data, fileName, options = {}) {
  const answers = normalizeAnswers(data);
  const revision = Boolean(options.revision);
  const videoNotes = Boolean(options.videoNotes);
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
    const mathParagraph = (text, color = '#173F83') => {
      for (const rawLine of String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)) {
        const formula = /^(?:formula|equation)\s*:/i.test(rawLine) || /(?:=|\b(?:integral|sum from)\b|\b(?:d|partial)\w*\s*\/)/i.test(rawLine);
        const line = rawLine.replace(/^(?:formula|equation)\s*:\s*/i, '');
        if (formula) {
          doc.font('Courier').fontSize(10.5);
          const lineHeight = doc.heightOfString(line, { width: textWidth - 10, lineGap: 3 });
          ensureRoom(lineHeight + 10);
          const y = doc.y;
          doc.save().roundedRect(doc.page.margins.left - 5, y - 2, textWidth + 10, lineHeight + 8, 3).fill('#EEF4FB').restore();
          doc.fillColor(color).text(line, doc.page.margins.left + 5, y + 2, { width: textWidth - 10, lineGap: 3 });
          doc.moveDown(0.2);
        } else {
          doc.font('Helvetica').fontSize(11.5).fillColor('#26384F');
          ensureRoom(doc.heightOfString(line, { width: textWidth, lineGap: 4 }) + 8);
          doc.text(line, { width: textWidth, lineGap: 4 });
          doc.moveDown(0.16);
        }
      }
    };

    doc.font('KalamBold').fontSize(revision ? 17 : 21).fillColor(blue)
      .text(normalizePdfText(revision ? 'One-page revision' : data.title || data.subject || 'Exam Answer Notes'), { width: textWidth, align: 'center' });
    doc.moveDown(0.65);
    answers.forEach((answer, index) => {
      if (!revision) ensureRoom(100);
      const question = revision ? `${answer.question.slice(0, 130)}${answer.question.length > 130 ? '...' : ''}` : answer.question;
      doc.font('KalamBold').fontSize(revision ? 12.5 : 17).fillColor(accents.Keywords).text(videoNotes ? 'VIDEO NOTES: ' : `Q${index + 1}. `, { continued: true });
      doc.font('KalamBold').fillColor(blue).text(question, { width: textWidth, lineGap: revision ? 1 : 3 });
      if (revision) {
        if (answer.isMath) {
          paragraph('FINAL: ' + answer.conclusion, 10, accents['Final Answer']);
          doc.moveDown(0.18); return;
        }
        const words = (answer.keywords.length ? answer.keywords : answer.points.map(p => p.title || p.desc)).slice(0, 7);
        paragraph(`KEYWORDS: ${words.join(' - ').toLocaleUpperCase()}`, 9.5, accents.Keywords);
        doc.moveDown(0.18); return;
      }
      if (answer.isMath) {
        if (answer.explanation) { heading('Worked Solution'); mathParagraph(answer.explanation); }
        if (answer.conclusion) { heading('Final Answer'); mathParagraph(answer.conclusion, accents['Final Answer']); }
        doc.moveDown(0.65);
        return;
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
        const spec = answer.diagramSpec;
        const hasStructuredDiagram = spec.layout !== 'none' && spec.nodes.length > 1;
        const recognized = hasStructuredDiagram || /\bmlp\b|multi[- ]layer perceptron|osi|open systems interconnection|deadlock|circular wait|resource allocation|machine learning|supervised|unsupervised|reinforcement/i.test(topicText);
        const hasDiagramInstruction = Boolean(answer.diagram && !/^not needed\.?$/i.test(answer.diagram.trim()));
        if (recognized || hasDiagramInstruction) {
          const count = spec.nodes.length;
          const dynamicHeight = spec.layout === 'cycle' ? 190
            : spec.layout === 'tree' ? 101 + Math.ceil(Math.max(1, count - 1) / 4) * 53
              : spec.layout === 'network' ? 42 + Math.ceil(Math.max(1, count) / 4) * 65
                : count > 4 ? 34 + count * 40 : 110;
          const diagramHeight = hasStructuredDiagram ? dynamicHeight
            : /\bmlp\b|multi[- ]layer perceptron/i.test(topicText) ? 168
            : /osi|open systems interconnection/i.test(topicText) ? 174
              : /deadlock|circular wait|resource allocation/i.test(topicText) ? 164
                : /machine learning|supervised|unsupervised|reinforcement/i.test(topicText) ? 170 : 80;
          // Keep the heading with its illustration when a page break is needed.
          ensureRoom(diagramHeight + 58);
          heading('Diagram');
          const diagramY = doc.y;
          const drawnHeight = drawTopicDiagram(doc, answer, doc.page.margins.left, diagramY, textWidth);
          if (drawnHeight) doc.y = diagramY + drawnHeight + 8;
          else paragraph(answer.diagram.replace(/^\[|\]$/g, ''), 13.5, accents.Diagram);
        }
      }
      if (answer.conclusion) { heading('Conclusion'); paragraph(answer.conclusion, 13.5, accents.Conclusion); }
      if (answer.keywords.length) { heading('Keywords'); paragraph(answer.keywords.join(' - ').toLocaleUpperCase(), 13, accents.Keywords); }
      doc.moveDown(0.75);
    });
    doc.end();
  });
}
