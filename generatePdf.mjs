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
      if (answer.diagram && !/^not needed\.?$/i.test(answer.diagram.trim())) { heading('Diagram'); paragraph(answer.diagram, 13.5, accents.Diagram); }
      if (answer.conclusion) { heading('Conclusion'); paragraph(answer.conclusion, 13.5, accents.Conclusion); }
      if (answer.keywords.length) { heading('Keywords'); paragraph(answer.keywords.join(' - ').toLocaleUpperCase(), 13, accents.Keywords); }
      doc.moveDown(0.75);
    });
    doc.end();
  });
}
