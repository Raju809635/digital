const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');

function fontPath(file) {
  const candidates = [path.join(__dirname, 'fonts', file), path.join(process.cwd(), 'fonts', file)];
  const match = candidates.find(candidate => fs.existsSync(candidate));
  if (!match) throw Object.assign(new Error(`PDF font asset is missing: ${file}`), { code: 'PDF_FONT_MISSING' });
  return match;
}
const blue = '#173F83';

function normalizeAnswers(data = {}) {
  const source = Array.isArray(data.answers) ? data.answers : [data];
  return source.map((answer, index) => {
    const points = answer.keyPoints || answer.points || [];
    return {
      question: String(answer.question || `Question ${index + 1}`),
      definition: String(answer.definition || ''),
      explanation: String(answer.explanation || ''),
      points: points.map(point => typeof point === 'string' ? point : [point.title, point.desc].filter(Boolean).join(': ')),
      diagram: String(answer.diagram || ''),
      conclusion: String(answer.conclusion || ''),
      keywords: (answer.keywords || []).map(String)
    };
  });
}

function generatePDF(data, fileName, options = {}) {
  const answers = normalizeAnswers(data);
  const revision = Boolean(options.revision);
  let regularFont; let boldFont;
  try { regularFont = fontPath('Kalam-Regular.ttf'); boldFont = fontPath('Kalam-Bold.ttf'); }
  catch (error) { return Promise.reject(error); }
  return new Promise((resolve, reject) => {
    // Avoid loading PDFKit's built-in Helvetica metrics; every printed element uses embedded Kalam.
    const doc = new PDFDocument({ size: 'A4', margins: { top: 66, bottom: 54, left: 78, right: 48 }, bufferPages: false, font: false });
    const chunks = [];
    let pageNumber = 0;
    doc.registerFont('Kalam', regularFont);
    doc.registerFont('KalamBold', boldFont);

    const drawPage = () => {
      pageNumber += 1;
      const savedX = doc.x; const savedY = doc.y;
      const { width, height } = doc.page;
      doc.save();
      doc.rect(0, 0, width, height).fill('#FDFDFD');
      doc.lineWidth(0.45).strokeColor('#DDE5EF');
      for (let y = 58; y < height - 30; y += 25) doc.moveTo(22, y).lineTo(width - 20, y).stroke();
      doc.lineWidth(1.1).strokeColor('#D8757D').moveTo(55, 0).lineTo(55, height).stroke();
      doc.font('Kalam').fontSize(14).fillColor(blue).text(`Page ${pageNumber}`, width - 105, 22, { width: 78, align: 'right', lineBreak: false });
      doc.restore(); doc.x = savedX; doc.y = savedY;
      doc.x = doc.page.margins.left; doc.y = 68;
    };
    doc.on('pageAdded', drawPage);
    drawPage();
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);
      if (!fileName) return resolve(buffer);
      const output = fs.createWriteStream(fileName);
      output.on('error', reject); output.on('finish', () => resolve(fileName)); output.end(buffer);
    });

    const textWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const ensureRoom = (height = 60) => { if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage(); };
    const heading = label => {
      ensureRoom(42); doc.moveDown(0.45); doc.font('KalamBold').fontSize(15).fillColor(blue)
        .text(label, doc.page.margins.left, doc.y, { width: textWidth, underline: true, lineGap: 1 });
      doc.moveDown(0.18);
    };
    const paragraph = (text, size = 13.5) => {
      if (!text) return;
      doc.font('Kalam').fontSize(size).fillColor(blue).text(text, { width: textWidth, lineGap: 4, paragraphGap: 3 });
    };

    doc.font('KalamBold').fontSize(revision ? 17 : 21).fillColor(blue).text(String(revision ? 'One-page revision' : data.title || data.subject || 'Exam Answer Notes'), { width: textWidth, align: 'center' });
    doc.moveDown(0.65);
    answers.forEach((answer, index) => {
      if (!revision) ensureRoom(100);
      const question = revision ? `${answer.question.slice(0, 130)}${answer.question.length > 130 ? '…' : ''}` : answer.question;
      doc.font('KalamBold').fontSize(revision ? 12.5 : 17).fillColor(blue).text(`Q${index + 1}. ${question}`, { width: textWidth, lineGap: revision ? 1 : 3 });
      if (revision) {
        const words = (answer.keywords.length ? answer.keywords : answer.points).slice(0, 7);
        paragraph(`KEYWORDS: ${words.join(' · ').toLocaleUpperCase()}`, 9.5);
        doc.moveDown(0.18); return;
      }
      if (answer.definition) { heading('Definition'); paragraph(answer.definition); }
      if (answer.explanation) { heading('Explanation'); paragraph(answer.explanation); }
      if (answer.points.length) {
        heading('Key Points');
        answer.points.forEach(point => {
          ensureRoom(36); doc.font('Kalam').fontSize(13.5).fillColor(blue).text(`•  ${point}`, { width: textWidth - 5, lineGap: 4, indent: 5 });
        });
      }
      if (answer.diagram && !/^not needed\.?$/i.test(answer.diagram.trim())) { heading('Diagram'); paragraph(answer.diagram); }
      if (answer.conclusion) { heading('Conclusion'); paragraph(answer.conclusion); }
      if (answer.keywords.length) { heading('Keywords'); paragraph(answer.keywords.join(' · ').toLocaleUpperCase()); }
      doc.moveDown(0.75);
    });
    doc.end();
  });
}

module.exports = generatePDF;
